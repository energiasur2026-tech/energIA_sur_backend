import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api-error';
import { getCurrentUser } from '@/lib/auth';
import { EMPTY_PROFILE, PROFILE_MAX_LENGTH, type Profile } from '@/domain/profile-types';
import { getProfile, saveProfile } from '@/lib/profiles';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

    return NextResponse.json({ email: user.email, profile: await getProfile(user.id) });
  } catch (error) {
    return apiError('api/profile', error);
  }
}

export async function PUT(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

    const body = (await request.json().catch(() => null)) as Partial<Profile> | null;
    if (!body) return NextResponse.json({ error: 'Datos no válidos.' }, { status: 400 });

    // El formulario ya limita el largo, pero esta ruta es alcanzable sin él.
    const profile: Profile = {
      firstName: clean(body.firstName),
      lastName: clean(body.lastName),
      phone: clean(body.phone),
      address: clean(body.address),
    };

    const tooLong = Object.values(profile).some((value) => value.length > PROFILE_MAX_LENGTH);
    if (tooLong) {
      return NextResponse.json(
        { error: `Cada campo admite hasta ${PROFILE_MAX_LENGTH} caracteres.` },
        { status: 400 }
      );
    }

    await saveProfile(user.id, profile);

    return NextResponse.json({ profile });
  } catch (error) {
    return apiError('api/profile', error);
  }
}

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : EMPTY_PROFILE.firstName;
}
