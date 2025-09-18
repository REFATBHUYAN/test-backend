import { Router } from 'express';
import { sendCalendlyInvite } from './sendCalendlyInvite.js';
const router = Router();

router.post('/v1/api/calendly/send-invite', sendCalendlyInvite);

// calencdlyrouter.js and sendcalendlyinvitation.js are previous code

export default router;