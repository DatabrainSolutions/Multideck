import { serveTenant } from "../_shared/tenant-lifecycle.ts";
import { createTrainingSessionHandler } from "./handler.ts"

serveTenant(createTrainingSessionHandler())
