# User Guide: Building Evacuation Guide

คู่มือการใช้งานระบบนำทางอพยพอาคาร

## 1. What This App Does

Building Evacuation Guide helps users find a safe evacuation route from their current room to an assembly point outside the building.

The app can:

- Search for your current room.
- Show a 2.5D floor map.
- Calculate the safest route to an assembly point.
- Avoid blocked stairs, corridors, or exits.
- Show step-by-step walking instructions.
- Support different user types, including seniors, children, and wheelchair users.
- Use AI chat to understand natural language location or hazard reports.

This demo uses a sample 5-floor building.

## 2. Open The App

Use the deployed website link, for example:

`https://evacuation-app.vercel.app`

For local use:

```bash
npm install
npm start
```

Then open:

`http://localhost:3001`

## 3. Start Evacuation

1. Click `เริ่มนำทางอพยพ`.
2. Choose or search for the room where you are located.
3. The app will calculate a route automatically.
4. Follow the green route line on the map.
5. Read the step-by-step instructions on the right panel.

You can also click a room directly on the map.

## 4. Search For A Room

Use the search box at the top of the app.

Examples:

- `Lobby`
- `205`
- `Office 401`
- `Library`
- `Server Room`
- `ห้องสมุด`

When a matching room appears, select it. The app will set that room as your current location and calculate the route.

## 5. Read The Map

The map shows:

| Symbol / Color | Meaning |
|---|---|
| Orange circle | Your current location |
| Green line | Recommended evacuation route |
| Blue blocks | Emergency stairs |
| Yellow blocks | Fire refuge areas |
| Green markers | Assembly points |
| Red marks | Blocked or unsafe area |
| Brown elevator block | Elevator, do not use during fire |

Assembly points:

- `จุดรวมพล A` is in front of the building.
- `จุดรวมพล B` is behind the building.

## 6. Switch Floors

Use the floor tabs to view different floors.

The route may pass through several floors. Switch floors to see each part of the route.

## 7. Report A Hazard

Use this when a stair, corridor, or exit is blocked by fire, smoke, debris, or another danger.

1. Click `รายงานเหตุ`.
2. Select the hazard location.
3. Select the floor or choose the whole building.
4. Click `กั้นเส้นทาง`.

The app will recalculate the route and avoid the blocked area.

To remove a hazard:

1. Open `รายงานเหตุ`.
2. Select the same location.
3. Click `ปลดเส้นทาง`.

## 8. Use AI Chat

Click the `แชท AI` tab.

You can type natural language messages such as:

- `ฉันอยู่ห้อง 205`
- `I am near the library`
- `บันได A ชั้น 3 มีไฟ`
- `ปิดทางออกหลัง`
- `ปลดบันได B`

The AI can help identify your location, report hazards, or answer basic evacuation questions.

If AI is unavailable, you can still use search, map selection, and manual hazard reporting.

## 9. User Type Selection

Use the user type dropdown to adjust estimated walking time and route behavior.

| User Type | Behavior |
|---|---|
| Normal | Standard evacuation speed |
| Senior | Slower estimated time |
| Child | Moderate estimated time |
| Wheelchair | Routes to a fire refuge area on upper floors |

For wheelchair users on upper floors, the app routes to a fire refuge area near the stairs instead of assuming the user can descend stairs alone.

## 10. Step-By-Step Route Panel

After selecting a room, the route panel shows:

- Destination assembly point.
- Total estimated distance.
- Estimated time.
- Walking instructions.
- Stair instructions.
- Exit instructions.

Follow the instructions in order.

## 11. Safety Notes

- Do not use elevators during a fire or emergency.
- Follow official emergency signs and staff instructions.
- If smoke or fire blocks the route, report the hazard and use the recalculated route.
- Move calmly and do not run.
- After reaching an assembly point, stay there for headcount.
- This app is a guide and does not replace official building safety procedures.

## 12. Troubleshooting

### AI does not respond

Check that the deployment has:

`GEMINI_API_KEY`

set in Vercel Environment Variables.

Also confirm the Gemini model in `api/ai.js` is available.

### Route does not appear

Try:

- Selecting a different room.
- Clearing blocked hazards.
- Switching to the correct floor tab.
- Using the search box instead of AI chat.

### Map labels look crowded

The map uses short room labels for readability. Full room names are still available in search results and route instructions.

## 13. Admin Notes

To update building data, edit:

`public/index.html`

Main sections:

- `FLOORS`
- `STAIRS`
- exit and assembly point logic
- room names and room types

After editing, commit, push to GitHub, and redeploy the Vercel project.
