# Authentication Flow Documentation

## Overview
Complete authentication and onboarding system with persistent login state.

## User Flow

### 1. **New User (First Time)**
```
Welcome Screen (onboarding) 
  → "Get Started" button 
  → Onboarding Quiz (personality, object, descriptors)
  → Enter Name
  → Sign Up (email + password)
  → Automatically logged in
  → Main App (Library)
```

### 2. **Returning User (Has Account)**
```
Welcome Screen (onboarding)
  → "Already have an account? Sign in" link
  → Login Screen (/auth/login)
  → Enter email + password
  → Sign in
  → Main App (Library)
  → Stays logged in until manual logout
```

### 3. **App Start Routing (index.tsx gate)**
```
App Start (index.tsx) — yourname.media 307s to /app, which lands here
  → Check Firebase Auth
  → Signed in (real account)? → Main App (Library)
  → Anonymous session (mid-onboarding relaunch)? → Onboarding
  → Signed out → Check AsyncStorage for hasSignedInBefore
      ✓ 'true'  → Login Screen (this device has held an account)
      ✗ absent  → Welcome Screen (onboarding) — fresh visitor
```

### 4. **Logout**
```
Profile Screen
  → "Log Out" button
  → Confirmation dialog
  → Sign out from Firebase (AuthContext.signOut)
  → Clear user-scoped AsyncStorage keys
    (hasCompletedOnboarding, userName, onboardingAnswers, storyTagPreferences)
  → hasSignedInBefore is kept — the NEXT cold visit routes to Login
  → Redirect to Welcome Screen (/onboarding)
```

Account deletion additionally clears `hasSignedInBefore` (the device is
fresh again) and also lands on the Welcome Screen.

## Key Files

### `/app/index.tsx` - Route Guard
- Checks if user is authenticated
- Real account → Library; anonymous → Onboarding
- Signed out: `hasSignedInBefore` → Login, else → Onboarding welcome

### `/app/onboarding.tsx` - New User Flow
- Welcome screen with "Get Started" and "Sign In" links
- Onboarding quiz steps
- Name input
- Sign up (creates Firebase auth + Firestore profile)
- Auto-navigates to Library after signup

### `/app/auth/login.tsx` - Returning User Flow
- Email + password input
- Signs in with Firebase
- Fetches user profile from Firestore
- Saves to AsyncStorage for persistence
- Navigates to Library

### `/app/(tabs)/profile.tsx` - Logout
- "Log Out" button in profile
- Calls AuthContext.signOut (Firebase sign-out + user-scoped storage purge)
- Redirects to /onboarding (welcome screen)

### `/contexts/AuthContext.tsx` - Auth State
- Provides `user`, `loading`, `signIn`, `signUp`, `signOut`
- Firebase auth state listener
- Persists auth across app restarts

## Persistent Login

### How It Works:
1. **Firebase Auth** maintains session automatically
2. **AsyncStorage** stores:
   - `hasCompletedOnboarding`: 'true' (user-scoped, cleared on logout)
   - `userName`: User's display name (user-scoped, cleared on logout)
   - `onboardingAnswers`: Quiz responses (user-scoped, cleared on logout)
   - `storyTagPreferences`: (user-scoped, cleared on logout)
   - `hasSignedInBefore`: 'true' once any real account signs in on this
     device; survives logout, removed only by account deletion

3. **On App Restart**:
   - Firebase SDK checks for existing session
   - If session exists → user is restored automatically
   - App navigates to Library

4. **User Must Explicitly Log Out**:
   - Logout clears Firebase session
   - Clears AsyncStorage
   - User must sign in again

## Security
- Firebase Auth handles password encryption
- User sessions are managed by Firebase
- AsyncStorage only stores non-sensitive data (name, quiz answers)
- Each user can only access their own Firestore documents
- Audio files in Storage are protected by security rules

## Testing Checklist

✅ **New User Flow**
- [ ] Welcome screen shows correctly
- [ ] "Get Started" begins onboarding
- [ ] Quiz completes successfully
- [ ] Sign up creates account
- [ ] User navigates to Library
- [ ] User stays logged in on app restart

✅ **Login Flow**
- [ ] "Sign in" link on welcome screen works
- [ ] Login screen accepts email/password
- [ ] Successful login navigates to Library
- [ ] User stays logged in on app restart
- [ ] User profile data is loaded

✅ **Logout Flow**
- [ ] "Log Out" button shows confirmation
- [ ] Logout clears session AND user-scoped localStorage keys
- [ ] User lands on the onboarding welcome screen
- [ ] Next cold visit routes to the Login screen (hasSignedInBefore)
- [ ] User must sign in again

✅ **Persistence**
- [ ] App restart maintains logged-in state
- [ ] Only manual logout ends session
- [ ] User data loads correctly after restart

## Common Issues

### Issue: User stuck on loading screen
**Solution**: Check Firebase config in `app.config.js` - ensure all Firebase keys are set

### Issue: Login doesn't navigate to Library
**Solution**: Check that AsyncStorage is being set in login handler

### Issue: User logged out after app restart
**Solution**: Firebase auth session may have expired. Check Firebase console for session settings

### Issue: Onboarding completed but still shows welcome
**Solution**: Clear AsyncStorage and try again: `AsyncStorage.clear()`
