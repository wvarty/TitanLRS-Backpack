# CRSF Parameters - Mock Implementation Summary

This document summarizes the mock implementation added to test the CRSF Parameters web interface.

## Files Modified

### 1. Web Interface (Already Complete)
- **[html/txbp_index.html](html/txbp_index.html)** - Added "Parameters" tab with two-panel layout
- **[html/scan.js](html/scan.js)** - Added JavaScript for device discovery and parameter management

### 2. C++ Backend (Mock Implementation)
- **[lib/WIFI/devWIFI.cpp](lib/WIFI/devWIFI.cpp)** - Added HTTP endpoint handlers with mock data

## Mock Endpoints Implemented

All endpoints are marked with `// MOCK:` and `// TODO:` comments indicating what needs to be replaced with real CRSF protocol implementation.

### GET /crsf/scan
**Purpose**: Discover CRSF devices

**Mock Response**: Returns 2 devices matching screenshot
```json
[
  {
    "name": "RM Ranger",
    "address": 238,
    "serialNumber": 1162629715,
    "parametersTotal": 33,
    "online": true
  },
  {
    "name": "RM XR4",
    "address": 236,
    "serialNumber": 1162629715,
    "parametersTotal": 13,
    "online": true
  }
]
```

**What it should do**: Send DEVICE_PING (0x28) broadcast, collect DEVICE_INFO (0x29) responses

### GET /crsf/params?device=\<address\>
**Purpose**: Load all parameters for a device

**Mock Response**: Returns 9 parameters for RM XR4 (matching screenshot):
1. Protocol (TEXT_SELECTION) - CRSF/Inversion/Off
2. Protocol2 (TEXT_SELECTION) - Off/CRSF/Inversion
3. SBUS failsafe (TEXT_SELECTION) - No Pulses/Last Position
4. Tlm Power (UINT8) - 100 mW
5. Team Race (COMMAND)
6. Bind Storage (TEXT_SELECTION) - Persistent/Volatile
7. Enter Bind Mode (COMMAND)
8. Model Id (TEXT_SELECTION) - Off/1/2/3
9. tx-usb-crsf (INFO) - "79edc1"

**What it should do**: Send PARAM_READ (0x2C) for each param, receive PARAM_ENTRY (0x2B) chunks, parse based on type

### POST /crsf/param/write
**Purpose**: Update a parameter value

**Mock Behavior**: Logs the request and returns success

**What it should do**: Serialize value, send PARAM_WRITE (0x2D) frame, wait for ACK

### POST /crsf/param/execute
**Purpose**: Execute a command parameter

**Mock Behavior**: Logs the request and returns success

**What it should do**: Send PARAM_WRITE (0x2D) for command parameter, wait for ACK

## Testing the Mock Implementation

1. **Build and flash** the firmware to your TX Backpack
2. **Connect to WiFi** - Access Point or Station mode
3. **Open web interface** at `http://elrs_txbp.local`
4. **Navigate to Parameters tab**
5. **Click "Scan for Devices"** - Should show RM Ranger and RM XR4
6. **Click on "RM XR4"** - Should load 9 parameters
7. **Test interactions**:
   - Change numeric values (e.g., Tlm Power)
   - Select dropdown options (e.g., Protocol)
   - Click command buttons (Team Race, Enter Bind Mode)
   - All should show success messages

## Next Steps - Real Implementation

To replace the mock implementation with real CRSF protocol:

### 1. Implement CRSF Frame Handling
See [CRSF_PARAMETERS_IMPLEMENTATION.md](CRSF_PARAMETERS_IMPLEMENTATION.md) for:
- Frame structure and CRC calculation
- Send/receive over Serial (to TX module MCU)
- Frame parsing and buffering

### 2. Replace Mock Handlers

**In HandleCRSFScan():**
```cpp
// Replace lines 283-316 with:
// 1. Send DEVICE_PING frame to broadcast (0x00)
// 2. Wait 2 seconds collecting DEVICE_INFO responses
// 3. Parse each response and build device list
```

**In HandleCRSFParams():**
```cpp
// Replace lines 321-476 with:
// 1. Loop through param numbers (1 to device.parametersTotal)
// 2. For each param:
//    - Send PARAM_READ with chunk 0
//    - Collect PARAM_ENTRY chunks until chunksRemaining = 0
//    - Parse based on type
// 3. Return JSON array of all parameters
```

**In HandleCRSFParamWrite():**
```cpp
// Replace lines 479-510 with:
// 1. Get parameter type from cached data
// 2. Serialize value based on type
// 3. Build PARAM_WRITE frame with serialized value
// 4. Send and wait for ACK
```

### 3. Add UART Communication

The handlers currently don't communicate with the TX module. You'll need to:
- Access the Serial port connected to TX module
- Implement timeout handling (2-5 seconds per request)
- Queue requests if multiple come in simultaneously
- Handle TX module disconnect/reconnect

## Key Mock Data Locations

Search for these markers in devWIFI.cpp:
- `// MOCK:` - Indicates mock behavior that needs replacement
- `// TODO:` - Indicates what the real implementation should do
- Lines 274-540 - Entire CRSF mock implementation block

## Debug Logging

The mock implementation includes debug logging:
```cpp
DBGLN("MOCK: Write param %d on device 0x%02X", paramNumber, deviceAddress);
```

These will help verify the web interface is calling the endpoints correctly. In the real implementation, replace with actual CRSF frame logging.

## Architecture Notes

The web interface is **completely independent** of the backend implementation:
- It just expects JSON responses from HTTP endpoints
- All CRSF protocol knowledge is on the C++ side
- You can test/debug the web UI entirely with mock data
- When you implement real CRSF, web UI requires no changes

This separation means you can:
1. Test the UI/UX now with mock data
2. Implement CRSF protocol incrementally
3. Swap in real data without touching JavaScript
