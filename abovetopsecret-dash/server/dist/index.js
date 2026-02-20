"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const metrics_1 = __importDefault(require("./routes/metrics"));
const export_1 = __importDefault(require("./routes/export"));
const overrides_1 = __importDefault(require("./routes/overrides"));
const webhooks_1 = __importDefault(require("./routes/webhooks"));
const sync_1 = __importDefault(require("./routes/sync"));
const settings_1 = __importDefault(require("./routes/settings"));
const auth_1 = require("./middleware/auth");
const scheduler_1 = require("./services/scheduler");
const app = (0, express_1.default)();
const PORT = parseInt(process.env.PORT || '4000', 10);
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: '1mb' }));
app.use(express_1.default.urlencoded({ extended: true }));
// Health check (no auth)
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// Webhooks use their own auth (signature verification), mount before general auth
app.use('/api/webhooks', webhooks_1.default);
// Apply auth middleware to all other /api routes
app.use('/api', auth_1.authMiddleware);
app.use('/api/metrics', metrics_1.default);
app.use('/api/export', export_1.default);
app.use('/api/overrides', overrides_1.default);
app.use('/api/sync', sync_1.default);
app.use('/api/settings', settings_1.default);
app.listen(PORT, '0.0.0.0', () => {
    console.log(`[ATS Server] Running on port ${PORT}`);
    (0, scheduler_1.startScheduler)();
});
//# sourceMappingURL=index.js.map