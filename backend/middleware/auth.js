import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'development-jwt-secret';
const AUTH_COOKIE_NAME = 'auth_token';

const requireAdmin = (req, res, next) => {
  const token = req.cookies?.[AUTH_COOKIE_NAME];

  if (!token) {
    res.status(401).json({ status: 'error', message: 'Authentication required' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    if (decoded.role !== 'admin') {
      res.status(403).json({ status: 'error', message: 'Admin access required' });
      return;
    }

    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ status: 'error', message: 'Authentication required' });
  }
};

const decodeAuthCookie = (req) => {
  const token = req.cookies?.[AUTH_COOKIE_NAME];

  if (!token) {
    return null;
  }

  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
};

const requireStudent = (req, res, next) => {
  const decoded = decodeAuthCookie(req);

  if (!decoded) {
    res.status(401).json({ status: 'error', message: 'Authentication required' });
    return;
  }

  if (decoded.role !== 'student') {
    res.status(403).json({ status: 'error', message: 'Student access required' });
    return;
  }

  req.user = decoded;
  next();
};

export {
  AUTH_COOKIE_NAME,
  JWT_SECRET,
  decodeAuthCookie,
  requireAdmin,
  requireStudent
};
