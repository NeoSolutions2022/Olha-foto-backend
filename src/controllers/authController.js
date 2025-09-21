import {
  registerUser,
  authenticateUser,
  refreshUserSession,
  revokeRefreshToken,
  getUserProfile
} from '../services/authService.js';

const buildRequestMetadata = (req) => ({
  userAgent: req.headers['user-agent'],
  ipAddress: req.ip
});

export const register = async (req, res, next) => {
  try {
    const {
      email,
      password,
      displayName,
      role,
      biography,
      phoneNumber,
      phone,
      websiteUrl,
      website,
      socialLinks,
      profileImageUrl,
      profilePhotoUrl,
      coverImageUrl,
      coverPhotoUrl,
      cpf,
      acceptedTerms,
      photographerProfile: nestedPhotographerProfile
    } = req.body;

    if (!email || !password || !displayName) {
      const error = new Error('email, password and displayName are required');
      error.status = 400;
      throw error;
    }

    const photographerProfile = {
      ...(nestedPhotographerProfile || {})
    };

    const additionalProfileFields = {
      biography,
      phoneNumber: phoneNumber ?? phone,
      websiteUrl: websiteUrl ?? website,
      socialLinks,
      profileImageUrl: profileImageUrl ?? profilePhotoUrl,
      coverImageUrl: coverImageUrl ?? coverPhotoUrl,
      cpf,
      acceptedTerms
    };

    Object.entries(additionalProfileFields).forEach(([key, value]) => {
      if (value !== undefined) {
        photographerProfile[key] = value;
      }
    });

    const result = await registerUser(
      { email, password, displayName, role, cpf, acceptedTerms, photographerProfile },
      buildRequestMetadata(req)
    );
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      const error = new Error('email and password are required');
      error.status = 400;
      throw error;
    }

    const result = await authenticateUser({ email, password }, buildRequestMetadata(req));
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      const error = new Error('refreshToken is required');
      error.status = 400;
      throw error;
    }

    const result = await refreshUserSession(refreshToken, buildRequestMetadata(req));
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      const error = new Error('refreshToken is required');
      error.status = 400;
      throw error;
    }

    await revokeRefreshToken(refreshToken);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const profile = async (req, res, next) => {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      const error = new Error('Missing authenticated user');
      error.status = 401;
      throw error;
    }

    const profileData = await getUserProfile(userId);
    if (!profileData) {
      const error = new Error('User not found');
      error.status = 404;
      throw error;
    }

    res.json(profileData);
  } catch (error) {
    next(error);
  }
};
