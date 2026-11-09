import 'server-only';

/**
 * Implementación de los puertos de acceso a datos contra Supabase.
 *
 * Es el único lugar donde las rutas y los casos de uso tocan la base. Cambiar
 * de proveedor se resolvería reescribiendo este archivo y nada más.
 */
import { getCurrentUser } from '../lib/auth';
import { countActiveEvents, listEvents } from '../lib/events';
import { clearHomeContext, getHomeContext, saveHomeContext } from '../lib/home';
import {
  getAllMeters,
  getMetersForOwner,
  setAlertsEnabled,
  setCollectionInterval,
  setGoal,
  setPhases,
  setPlacement,
  setSensitivity,
  setThresholds,
} from '../lib/meters';
import { getProfile, saveProfile } from '../lib/profiles';
import {
  getDailyEnergy,
  getForecastBasis,
  getHourlyProfile,
  getLastScheduledReading,
  getLatestReading,
  getPeriodConsumption,
  getSeries,
  getSummary,
} from '../lib/readings';
import type { Repositories } from '../domain/repositories';

export const supabaseRepositories: Repositories = {
  meters: {
    all: () => getAllMeters(),
    forOwner: (userId) => getMetersForOwner(userId),
    setCollectionInterval: async (deviceId, minutes) => {
      await setCollectionInterval(deviceId, minutes);
    },
    setAlertsEnabled: async (deviceId, enabled) => {
      await setAlertsEnabled(deviceId, enabled);
    },
    setGoal: async (deviceId, goalKwh, mode) => {
      await setGoal(deviceId, goalKwh, mode);
    },
    setPlacement: async (deviceId, placement) => {
      await setPlacement(deviceId, placement);
    },
    setPhases: async (deviceId, phases) => {
      await setPhases(deviceId, phases);
    },
    setSensitivity: async (deviceId, sensitivity) => {
      await setSensitivity(deviceId, sensitivity);
    },
    setThresholds: async (deviceId, thresholds) => {
      await setThresholds(deviceId, thresholds);
    },
  },

  readings: {
    series: (deviceId, from, to, bucketSeconds) => getSeries(deviceId, from, to, bucketSeconds),
    summary: (deviceId, from, to) => getSummary(deviceId, from, to),
    periodConsumption: (deviceId, from, to) => getPeriodConsumption(deviceId, from, to),
    forecastBasis: (deviceId, from, to) => getForecastBasis(deviceId, from, to),
    hourlyProfile: (deviceId, from, to) => getHourlyProfile(deviceId, from, to),
    dailyEnergy: (deviceId, from, to) => getDailyEnergy(deviceId, from, to),
    latest: (deviceId) => getLatestReading(deviceId),
    lastScheduledAt: (deviceId) => getLastScheduledReading(deviceId),
  },

  events: {
    list: (deviceId, limit) => listEvents(deviceId, limit),
    countActive: (deviceId) => countActiveEvents(deviceId),
  },

  home: {
    get: (deviceId) => getHomeContext(deviceId),
    save: async (deviceId, home) => {
      await saveHomeContext(deviceId, home);
    },
    clear: async (deviceId) => {
      await clearHomeContext(deviceId);
    },
  },

  profiles: {
    get: (userId) => getProfile(userId),
    save: async (userId, profile) => {
      await saveProfile(userId, profile);
    },
  },

  session: {
    currentUser: async () => {
      const user = await getCurrentUser();
      return user ? { id: user.id, email: user.email } : null;
    },
  },
};
