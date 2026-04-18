const jwt = require("jsonwebtoken");
const { AppError } = require("./errorHandler");

// 1. Basic Auth: Token verify karega aur check karega ki user logged in hai ya nahi
const adminAuth = (req, res, next) => {
  try {
    const token = req.cookies.adminAccessToken;
    
    if (!token) {
      return next(new AppError("Not authorized. Please login.", 401));
    }

    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    
    if (!decoded?.role) {
      return next(new AppError("Invalid access token", 401));
    }

    // Yahan hum sirf check kar rahe hain ki kya role valid hai (admin ya manager)
    if (!["admin", "manager"].includes(decoded.role)) {
      return next(new AppError("Access denied. Invalid role.", 403));
    }

    req.admin = {
      id: decoded.id,
      role: decoded.role,
    };

    next();
  } catch (err) {
    return next(new AppError("Invalid or expired access token", 401));
  }
};

// 2. Role Authorization: Specific routes par permission check karega
const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    // Agar user ka role allowedRoles array mein nahi hai, toh block kar do
    if (!req.admin || !allowedRoles.includes(req.admin.role)) {
      return next(
        new AppError(`Access Restricted. Managers cannot access this route.`, 403)
      );
    }
    next(); // Agar role match ho gaya, toh request aage controller tak jayegi
  };
};

// Dono ko export karein
module.exports = { adminAuth, authorizeRoles };


// const jwt = require("jsonwebtoken");
// const { AppError } = require("./errorHandler");

// const adminAuth = (req, res, next) => {
//   try {
//     const token = req.cookies.adminAccessToken;
//     console.log("$$$ token",token)
//     if (!token) {
//       return next(new AppError("Not authorized. Please login.", 401));
//     }

//     const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
//     console.log("Decode", decoded)
//     if (!decoded?.role) {
//       return next(new AppError("Invalid access token", 401));
//     }

//     if (!["admin", "superadmin"].includes(decoded.role)) {
//       return next(
//         new AppError("Access denied. Admin privileges required", 403),
//       );
//     }

//     req.admin = {
//       id: decoded.id,
//       role: decoded.role,
//     };

//     next();
//   } catch (err) {
//     return next(new AppError("Invalid or expired access token", 401));
//   }
// };

// module.exports = adminAuth;
