# Profile Page Dynamic Upgrade TODO

## Backend Updates
- [ ] Update `/profile` route in routes/index.js to calculate:
  - Completed lessons count from LessonCompletion model
  - User rank based on points comparison
  - Recent lesson completions as activities
- [ ] Update `/profile/:id` route for viewing other users' profiles with same dynamic data

## Frontend Updates
- [ ] Update views/profile.ejs to use dynamic stats instead of hardcoded values
- [ ] Update views/profileView.ejs to display dynamic stats for target user
- [ ] Ensure tree visualization logic uses dynamic points data

## Testing
- [ ] Test profile page loads with real data
- [ ] Test profile view page for other users
- [ ] Verify rank calculation is accurate
- [ ] Verify lesson completion count is correct
