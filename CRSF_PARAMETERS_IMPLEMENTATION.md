# CRSF Parameters Implementation Guide

This document describes the implementation of the Parameters tab in the TX Backpack web interface and provides guidance for implementing the C++ backend.

## Overview

A new "Parameters" tab has been added to [txbp_index.html](html/txbp_index.html) that allows users to discover CRSF devices and configure their parameters through a web interface.

## Current Status

✅ **Web Interface**: Fully implemented in HTML/JavaScript
✅ **Mock Backend**: C++ handlers with mock data for testing
⏳ **Real Backend**: TODO - Replace mock data with actual CRSF protocol implementation

The mock implementation in [devWIFI.cpp](lib/WIFI/devWIFI.cpp) currently returns sample data, allowing you to test the web interface without hardware. Look for `// MOCK:` and `// TODO:` comments to identify what needs to be replaced.

## Web Interface Features

### Layout
- **Two-panel design**:
  - Left panel: Device discovery and selection
  - Right panel: Parameter display and editing

### Functionality
1. **Device Discovery**: Scan for CRSF devices on the UART bus
2. **Device Selection**: Click to select a device and load its parameters
3. **Parameter Browsing**: Navigate hierarchical folder structure
4. **Parameter Editing**: Different UI widgets based on parameter type
5. **Parameter Writing**: Save changes back to the device

## CRSF Protocol Details

### Frame Structure
All CRSF frames follow this structure:
```
[SYNC_BYTE] [LENGTH] [TYPE] [DEST] [ORIGIN] [PAYLOAD...] [CRC]
  0xC8       1 byte  1 byte 1 byte 1 byte   variable    1 byte
```

### Relevant Frame Types
- `0x28` - DEVICE_PING: Request device information
- `0x29` - DEVICE_INFO: Device information response
- `0x2B` - PARAM_ENTRY: Parameter data (chunked)
- `0x2C` - PARAM_READ: Request parameter
- `0x2D` - PARAM_WRITE: Write parameter value

### Parameter Types
```cpp
enum ParamType {
    UINT8 = 0x00,
    INT8 = 0x01,
    UINT16 = 0x02,
    INT16 = 0x03,
    UINT32 = 0x04,
    INT32 = 0x05,
    FLOAT = 0x08,
    TEXT_SELECTION = 0x09,
    STRING = 0x0A,
    FOLDER = 0x0B,
    INFO = 0x0C,
    COMMAND = 0x0D
};
```

## Required HTTP Endpoints (C++ Backend)

The web interface expects the following HTTP endpoints to be implemented:

### 1. Device Scan - `GET /crsf/scan`

**Purpose**: Scan for CRSF devices and return discovered devices

**Process**:
1. Send DEVICE_PING frame (0x28) to broadcast address (0x00)
2. Wait 2 seconds for DEVICE_INFO responses (0x29)
3. Parse each DEVICE_INFO response

**DEVICE_INFO Payload Structure**:
```
[NAME (null-terminated string)]
[SERIAL_NUMBER (4 bytes, big-endian)]
[HARDWARE_ID (4 bytes, big-endian)]
[FIRMWARE_ID (4 bytes, big-endian)]
[PARAM_COUNT (1 byte)]
[PARAM_VERSION (1 byte)]
```

**Response JSON**:
```json
[
  {
    "name": "RM XR4",
    "address": 236,
    "serialNumber": 1162629915,
    "hardwareId": 0,
    "firmwareId": 262144,
    "parametersTotal": 13,
    "parameterVersion": 0,
    "online": true
  }
]
```

### 2. Load Parameters - `GET /crsf/params?device=<address>`

**Purpose**: Load all parameters for a specific device

**Process**:
1. For each parameter number (1 to parametersTotal):
   - Send PARAM_READ frame (0x2C) with payload: `[PARAM_NUMBER] [CHUNK_NUMBER]`
   - Receive PARAM_ENTRY frames (0x2B) until chunksRemaining = 0
   - Concatenate chunks and parse parameter data

**PARAM_ENTRY Payload Structure**:
```
[PARAM_NUMBER (1 byte)]
[CHUNKS_REMAINING (1 byte)]
[CHUNK_DATA (variable)]
```

**Parameter Common Header** (in chunk data):
```
[PARENT_FOLDER (1 byte)]
[TYPE_BYTE (1 byte)]  // type | (hidden ? 0x80 : 0)
[NAME (null-terminated string)]
```

**Type-Specific Data** (examples):

**Numeric (UINT8, INT8, UINT16, INT16, UINT32, INT32)**:
```
[VALUE (N bytes)] [MIN (N bytes)] [MAX (N bytes)]
[DEFAULT (N bytes)] [UNIT (null-terminated)]
```

**TEXT_SELECTION**:
```
[OPTIONS (null-terminated, semicolon-separated)]
[VALUE (1 byte)] [MIN (1 byte)] [MAX (1 byte)]
[DEFAULT (1 byte)] [UNIT (null-terminated)]
```

**STRING**:
```
[VALUE (null-terminated)] [MAX_LENGTH (1 byte)]
```

**FLOAT**:
```
[VALUE (4 bytes)] [MIN (4 bytes)] [MAX (4 bytes)]
[DEFAULT (4 bytes)] [DECIMAL_POINT (1 byte)]
[STEP_SIZE (4 bytes)] [UNIT (null-terminated)]
```

**Response JSON** (array of all parameters):
```json
[
  {
    "paramNumber": 1,
    "parentFolder": 0,
    "type": 9,
    "isHidden": false,
    "name": "Protocol",
    "options": ["CRSF", "Inversion", "Off"],
    "value": 0,
    "min": 0,
    "max": 2,
    "default": 0,
    "unit": ""
  },
  {
    "paramNumber": 4,
    "parentFolder": 0,
    "type": 0,
    "isHidden": false,
    "name": "Tlm Power",
    "value": 100,
    "min": 0,
    "max": 250,
    "default": 100,
    "unit": "mW"
  }
]
```

### 3. Write Parameter - `POST /crsf/param/write`

**Purpose**: Update a parameter value

**Request JSON**:
```json
{
  "device": 236,
  "paramNumber": 4,
  "value": 150
}
```

**Process**:
1. Serialize the value based on parameter type
2. Send PARAM_WRITE frame (0x2D) with payload:
   ```
   [PARAM_NUMBER (1 byte)] [VALUE (variable)]
   ```
3. Wait for acknowledgment from device
4. Optionally re-read the parameter to confirm

**Response**: HTTP 200 on success, 4xx/5xx on error

### 4. Execute Command - `POST /crsf/param/execute`

**Purpose**: Execute a command-type parameter

**Request JSON**:
```json
{
  "device": 236,
  "paramNumber": 8
}
```

**Process**: Same as writing a parameter (commands are executed when written)

**Response**: HTTP 200 on success, 4xx/5xx on error

## C++ Implementation Checklist

### Serial Communication
- [ ] Implement CRSF frame transmission (sync byte, length, type, dest, origin, payload, CRC)
- [ ] Implement CRSF frame reception and parsing
- [ ] Implement CRC calculation (XOR-based with polynomial 0xD5)
- [ ] Handle frame buffering for incomplete frames

### Device Discovery
- [ ] Implement DEVICE_PING broadcast
- [ ] Parse DEVICE_INFO responses
- [ ] Store discovered devices in memory
- [ ] Implement `/crsf/scan` HTTP endpoint

### Parameter Reading
- [ ] Implement PARAM_READ frame transmission
- [ ] Handle chunked PARAM_ENTRY responses
- [ ] Parse parameter common header
- [ ] Parse type-specific parameter data
- [ ] Implement parsers for all parameter types
- [ ] Implement `/crsf/params` HTTP endpoint

### Parameter Writing
- [ ] Implement parameter value serialization
- [ ] Implement PARAM_WRITE frame transmission
- [ ] Handle acknowledgments
- [ ] Implement `/crsf/param/write` HTTP endpoint
- [ ] Implement `/crsf/param/execute` HTTP endpoint

### Web Server Integration
- [ ] Add HTTP routes to existing web server
- [ ] Implement JSON serialization/deserialization
- [ ] Handle concurrent requests properly
- [ ] Add error handling and timeouts

## Example CRSF Frame Construction

### Sending DEVICE_PING
```cpp
uint8_t frame[] = {
    0xC8,           // SYNC_BYTE
    0x04,           // LENGTH (type + dest + origin + payload)
    0x28,           // TYPE (DEVICE_PING)
    0x00,           // DEST (broadcast)
    0xEA,           // ORIGIN (radio transmitter)
    // No payload for PING
    0x00            // CRC (calculated)
};
frame[6] = calculateCRC(&frame[2], 4);
Serial.write(frame, 7);
```

### Sending PARAM_READ
```cpp
uint8_t paramNumber = 1;
uint8_t chunkNumber = 0;
uint8_t frame[] = {
    0xC8,           // SYNC_BYTE
    0x06,           // LENGTH
    0x2C,           // TYPE (PARAM_READ)
    0xEC,           // DEST (device address)
    0xEA,           // ORIGIN (radio)
    paramNumber,    // PAYLOAD: param number
    chunkNumber,    // PAYLOAD: chunk number
    0x00            // CRC
};
frame[8] = calculateCRC(&frame[2], 6);
Serial.write(frame, 9);
```

### CRC Calculation
```cpp
uint8_t calculateCRC(uint8_t *data, uint8_t len) {
    uint8_t crc = 0;
    for (uint8_t i = 0; i < len; i++) {
        crc ^= data[i];
        for (uint8_t j = 0; j < 8; j++) {
            if (crc & 0x80) {
                crc = (crc << 1) ^ 0xD5;
            } else {
                crc = crc << 1;
            }
        }
    }
    return crc;
}
```

## Data Structure Examples (C++)

```cpp
struct CRSFDevice {
    char name[32];
    uint8_t address;
    uint32_t serialNumber;
    uint32_t hardwareId;
    uint32_t firmwareId;
    uint8_t parametersTotal;
    uint8_t parameterVersion;
    bool online;
};

struct CRSFParameter {
    uint8_t paramNumber;
    uint8_t parentFolder;
    uint8_t type;
    bool isHidden;
    char name[64];

    // Type-specific union
    union {
        struct {
            int32_t value;
            int32_t min;
            int32_t max;
            int32_t defaultValue;
            char unit[16];
        } numeric;

        struct {
            char options[256];  // semicolon-separated
            uint8_t value;
            uint8_t min;
            uint8_t max;
            uint8_t defaultValue;
            char unit[16];
        } textSelection;

        struct {
            char value[128];
            uint8_t maxLength;
        } string;

        struct {
            float value;
            float min;
            float max;
            float defaultValue;
            uint8_t decimalPoint;
            float stepSize;
            char unit[16];
        } floatParam;
    };
};
```

## Next Steps

1. Implement CRSF frame handling in [Tx_main.cpp](src/Tx_main.cpp)
1. Test with actual hardware
1. Iterate based on testing results

## Notes

- The web interface is already complete and functional
- All JavaScript is in [scan.js](html/scan.js)
- The HTML structure is in [txbp_index.html](html/txbp_index.html)
- The C++ code just needs to provide the three HTTP endpoints
- Parameters are read once and cached in the browser
- Consider adding WebSocket support for real-time parameter updates (optional)
