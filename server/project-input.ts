import { z } from 'zod';
import { storedProjectTypes } from '../shared/project-types.js';
export const projectTypeInput = z
  .enum(storedProjectTypes)
  .nullable()
  .transform((value) => value ?? 'general');
