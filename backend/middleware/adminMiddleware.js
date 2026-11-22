"use strict";

const authMiddleware = require("./authMiddleware");

function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== "admin") {
        return res.status(403).json({
            success: false,
            message: "Bạn không có quyền truy cập khu vực quản trị."
        });
    }
    return next();
}

module.exports = [authMiddleware, requireAdmin];
