"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSosPlatformFeePercent = exports.MECHANIC_PLAN_FEE_PERCENT = exports.PEER_MECHANIC_FEE_PERCENT = void 0;
/** Allineato a src/lib/platformFees.ts — 5% solo ciclista esperto. */
exports.PEER_MECHANIC_FEE_PERCENT = 0.05;
/** Meccanico pro: fee per piano abbonamento. */
exports.MECHANIC_PLAN_FEE_PERCENT = {
    MECHANIC_FREE: 0.15,
    BASE: 0.15,
    CLUB: 0.1,
    PRO: 0.05,
};
function getSosPlatformFeePercent(role, plan) {
    var _a;
    if (role === 'PEER_MECHANIC')
        return exports.PEER_MECHANIC_FEE_PERCENT;
    return (_a = exports.MECHANIC_PLAN_FEE_PERCENT[plan || 'BASE']) !== null && _a !== void 0 ? _a : 0.15;
}
exports.getSosPlatformFeePercent = getSosPlatformFeePercent;
//# sourceMappingURL=platformFees.js.map