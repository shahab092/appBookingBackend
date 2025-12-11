const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
      passReqToCallback: true
    },
    async (req, accessToken, refreshToken, profile, done) => {
      try {
        // Extract user info from Google profile
        const { id, displayName, emails, photos } = profile;
        const email = emails && emails[0] ? emails[0].value : null;
        const photo = photos && photos[0] ? photos[0].value : null;

        if (!email) {
          return done(new Error('No email found from Google'), null);
        }

        // Check if user already exists
        let user = await User.findOne({ email });

        if (user) {
          // Update Google ID if not set
          if (!user.googleId) {
            user.googleId = id;
            await user.save();
          }
          return done(null, user);
        }

        // Create new user
        user = new User({
          googleId: id,
          name: displayName,
          email: email,
          avatar: photo,
          isVerified: true,
          provider: 'google'
        });

        await user.save();
        done(null, user);
      } catch (error) {
        console.error('Google OAuth Error:', error);
        done(error, null);
      }
    }
  )
);