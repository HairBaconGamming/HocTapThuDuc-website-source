# TODO: Add Soil Details and Moisture Timer to Garden

## 1. Update views/garden.ejs
- [ ] Add HTML elements for soil status and moisture timer in the stats panel
- [ ] Add helper function `formatTimeHMS` for HH:MM:SS formatting
- [ ] Modify `showPlantStats` function to handle plots and plants, including soil checks

## 2. Update public/js/gardenPhaser.js
- [ ] Make plot sprites interactive in `renderItem` and add hover/out events for mini HUD
- [ ] Update `createMiniHUD` to support plots (only "Xem" button, no progress bar or move)
- [ ] Update `handleToolAction` for cursor tool to show plot stats if no plant

## 3. Testing
- [ ] Test garden page: interact with plots and plants
- [ ] Verify moisture timer updates in real-time
- [ ] Ensure soil status displays correctly
