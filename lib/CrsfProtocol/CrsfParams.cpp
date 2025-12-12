#include "CrsfParams.h"
#include "crsf_protocol.h"
#include "logging.h"
#include <math.h>

// Global instance
CRSFParams crsfParams;

CRSFParams::CRSFParams() :
    _serial(nullptr),
    _state(CRSF_STATE_IDLE),
    _requestStartTime(0),
    _lastActivityTime(0),
    _rxIndex(0),
    _onDeviceInfo(nullptr),
    _onScanComplete(nullptr),
    _targetDevice(0),
    _targetParamCount(0),
    _currentParam(0),
    _currentChunk(0),
    _paramChunksLen(0),
    _onParamInfo(nullptr),
    _onParamComplete(nullptr),
    _onWriteComplete(nullptr)
{
    memset(_lastError, 0, sizeof(_lastError));
    memset(_rxBuffer, 0, sizeof(_rxBuffer));
    memset(_paramChunks, 0, sizeof(_paramChunks));
}

void CRSFParams::begin(Stream* serial) {
    _serial = serial;
}

void CRSFParams::loop() {
    // Only check for timeout - byte processing happens externally via processReceivedByte()
    checkTimeout();
}

void CRSFParams::processReceivedByte(uint8_t byte) {
    // Assemble frame and process if complete
    if (assembleFrame(byte)) {
        processFrame();
    }
}

//=========================================================
// CRC Calculation (CRSF uses polynomial 0xD5)
//=========================================================

uint8_t CRSFParams::calculateCRC(const uint8_t* data, uint8_t len) {
    uint8_t crc = 0;
    for (uint8_t i = 0; i < len; i++) {
        crc ^= data[i];
        for (uint8_t j = 0; j < 8; j++) {
            if (crc & 0x80) {
                crc = (crc << 1) ^ CRSF_CRC_POLY;
            } else {
                crc = crc << 1;
            }
        }
    }
    return crc;
}

//=========================================================
// Frame Sending
//=========================================================

void CRSFParams::sendFrame(uint8_t type, uint8_t destination, uint8_t origin,
                          const uint8_t* payload, uint8_t payloadLen) {
    if (!_serial) return;
    
    // Frame structure: [SYNC] [LEN] [TYPE] [DEST] [ORIGIN] [PAYLOAD...] [CRC]
    // LEN = type + dest + origin + payload + crc = 4 + payloadLen
    uint8_t frameLen = 4 + payloadLen;
    uint8_t frame[CRSF_MAX_FRAME_SIZE];
    uint8_t idx = 0;
    
    frame[idx++] = CRSF_SYNC_BYTE;
    frame[idx++] = frameLen;
    frame[idx++] = type;
    frame[idx++] = destination;
    frame[idx++] = origin;
    
    if (payload && payloadLen > 0) {
        memcpy(&frame[idx], payload, payloadLen);
        idx += payloadLen;
    }
    
    // Calculate CRC over type, dest, origin, and payload (everything after length byte, excluding CRC)
    uint8_t crc = calculateCRC(&frame[2], frameLen - 1);
    frame[idx++] = crc;
    
    DBGLN("CRSF TX: type=0x%02X dest=0x%02X origin=0x%02X payloadLen=%d", type, destination, origin, payloadLen);
    DBG("  Frame: ");
    for (uint8_t i = 0; i < idx; i++) {
        DBG("0x%02X ", frame[i]);
    }
    DBGLN("");
    
    _serial->write(frame, idx);
    _lastActivityTime = millis();
}

void CRSFParams::sendDevicePing() {
    // DEVICE_PING has no payload, broadcast to all devices
    sendFrame(CRSF_FRAMETYPE_DEVICE_PING, CRSF_ADDRESS_BROADCAST, CRSF_ADDRESS_RADIO_TRANSMITTER, nullptr, 0);
}

void CRSFParams::sendParamRead(uint8_t deviceAddress, uint8_t paramNumber, uint8_t chunkNumber) {
    // PARAM_READ payload: [PARAM_NUMBER] [CHUNK_NUMBER]
    uint8_t payload[2] = { paramNumber, chunkNumber };
    sendFrame(CRSF_FRAMETYPE_PARAM_READ, deviceAddress, CRSF_ADDRESS_RADIO_TRANSMITTER, payload, 2);
}

void CRSFParams::sendParamWrite(uint8_t deviceAddress, uint8_t paramNumber,
                               const uint8_t* value, uint8_t valueLen) {
    // PARAM_WRITE payload: [PARAM_NUMBER] [VALUE...]
    uint8_t payload[CRSF_MAX_PAYLOAD_SIZE];
    payload[0] = paramNumber;
    if (value && valueLen > 0 && valueLen < CRSF_MAX_PAYLOAD_SIZE - 1) {
        memcpy(&payload[1], value, valueLen);
    }
    sendFrame(CRSF_FRAMETYPE_PARAM_WRITE, deviceAddress, CRSF_ADDRESS_RADIO_TRANSMITTER, payload, 1 + valueLen);
}

//=========================================================
// Frame Receiving
//=========================================================

bool CRSFParams::assembleFrame(uint8_t byte) {
    // State machine to assemble CRSF frames
    if (_rxIndex == 0) {
        // Looking for sync byte
        if (byte == CRSF_SYNC_BYTE) {
            _rxBuffer[_rxIndex++] = byte;
        }
        return false;
    }
    
    if (_rxIndex == 1) {
        // Frame length byte
        if (byte > 0 && byte <= CRSF_MAX_FRAME_SIZE - 2) {
            _rxBuffer[_rxIndex++] = byte;
        } else {
            // Invalid length, reset
            _rxIndex = 0;
        }
        return false;
    }
    
    // Accumulate frame bytes
    _rxBuffer[_rxIndex++] = byte;
    
    // Check if we have complete frame
    // Total frame size = sync(1) + len(1) + payload(len) 
    uint8_t expectedLen = _rxBuffer[1] + 2;
    
    if (_rxIndex >= expectedLen) {
        // Verify CRC
        uint8_t frameLen = _rxBuffer[1];
        uint8_t calculatedCRC = calculateCRC(&_rxBuffer[2], frameLen - 1);
        uint8_t receivedCRC = _rxBuffer[_rxIndex - 1];
        
        if (calculatedCRC == receivedCRC) {
            return true;
        } else {
            DBGLN("CRSF CRC FAIL: calc=0x%02X recv=0x%02X type=0x%02X", calculatedCRC, receivedCRC, _rxBuffer[2]);
        }
        
        // Reset for next frame
        _rxIndex = 0;
    }
    
    return false;
}

void CRSFParams::processFrame() {
    uint8_t type = _rxBuffer[2];
    uint8_t frameLen = _rxBuffer[1];
    uint8_t dest = _rxBuffer[3];
    uint8_t origin = _rxBuffer[4];

    DBGLN("CRSF RX: type=0x%02X len=%d dest=0x%02X origin=0x%02X state=%d", type, frameLen, dest, origin, _state);
    DBG("  Frame: ");
    for (uint8_t i = 0; i < frameLen + 2 && i < 32; i++) {
        DBG("%02X ", _rxBuffer[i]);
    }
    DBGLN("");
    
    switch (type) {
        case CRSF_FRAMETYPE_DEVICE_INFO:
            handleDeviceInfo();
            break;
        case CRSF_FRAMETYPE_PARAM_ENTRY:
            handleParamEntry();
            break;
        default:
            // Unknown or unhandled frame type
            break;
    }
    
    // Reset for next frame
    _rxIndex = 0;
}

//=========================================================
// Device Discovery
//=========================================================

void CRSFParams::startScan(DeviceInfoCallback onDevice, CompletionCallback onComplete) {
    if (_state != CRSF_STATE_IDLE) {
        if (onComplete) onComplete(false);
        return;
    }
    
    _state = CRSF_STATE_SCANNING;
    _requestStartTime = millis();
    _lastActivityTime = millis();
    _onDeviceInfo = onDevice;
    _onScanComplete = onComplete;
    _discoveredDevices.clear();
    
    DBGLN("CRSF: Starting device scan");
    
    // Send device ping broadcast
    sendDevicePing();
}

void CRSFParams::cancelScan() {
    if (_state == CRSF_STATE_SCANNING) {
        _state = CRSF_STATE_IDLE;
        _onDeviceInfo = nullptr;
        _onScanComplete = nullptr;
        DBGLN("CRSF: Scan cancelled");
    }
}

void CRSFParams::cancelParameterLoad() {
    if (_state == CRSF_STATE_READING_PARAMS) {
        _state = CRSF_STATE_IDLE;
        _onParamInfo = nullptr;
        _onParamComplete = nullptr;
        _paramChunksLen = 0;
        DBGLN("CRSF: Parameter load cancelled");
    }
}

void CRSFParams::handleDeviceInfo() {
    if (_state != CRSF_STATE_SCANNING) {
        DBGLN("CRSF: Ignoring DEVICE_INFO (wrong state: %d)", _state);
        return;
    }
    
    // Parse DEVICE_INFO frame
    // Frame structure: [SYNC] [LEN] [TYPE] [DEST] [ORIGIN] [NAME\0] [SERIAL(4)] [HW_ID(4)] [FW_ID(4)] [PARAM_COUNT] [PARAM_VERSION] [CRC]
    
    uint8_t frameLen = _rxBuffer[1];
    uint8_t origin = _rxBuffer[4];
    uint8_t* payload = &_rxBuffer[5];
    uint8_t payloadLen = frameLen - 4; // Subtract type, dest, origin, and CRC
    
    CRSFDeviceInfo device;
    memset(&device, 0, sizeof(device));
    device.address = origin;
    device.online = true;
    
    // Parse device name (null-terminated)
    uint16_t nameLen = parseNullTerminatedString(payload, payloadLen, device.name, sizeof(device.name));
    
    if (nameLen > 0 && nameLen + 14 <= payloadLen) {
        uint16_t offset = nameLen + 1; // +1 for null terminator
        
        device.serialNumber = parseUint32BE(&payload[offset]);
        offset += 4;
        device.hardwareId = parseUint32BE(&payload[offset]);
        offset += 4;
        device.firmwareId = parseUint32BE(&payload[offset]);
        offset += 4;
        device.parametersTotal = payload[offset++];
        device.parameterVersion = payload[offset++];
        
        DBGLN("CRSF Device: %s addr=0x%02X params=%d", device.name, device.address, device.parametersTotal);
        
        // Add to discovered list and notify callback
        _discoveredDevices.push_back(device);
        if (_onDeviceInfo) {
            _onDeviceInfo(device);
        }
    }
    
    _lastActivityTime = millis();
}

//=========================================================
// Parameter Loading
//=========================================================

void CRSFParams::loadParameters(uint8_t deviceAddress, uint8_t paramCount,
                               ParamInfoCallback onParam, CompletionCallback onComplete) {
    // Cancel any ongoing parameter load
    if (_state == CRSF_STATE_READING_PARAMS) {
        DBGLN("CRSF: Cancelling previous parameter load");
        cancelParameterLoad();
    }

    if (_state != CRSF_STATE_IDLE) {
        DBGLN("CRSF: Cannot start param load, state=%d", _state);
        if (onComplete) onComplete(false);
        return;
    }
    
    _state = CRSF_STATE_READING_PARAMS;
    _requestStartTime = millis();
    _lastActivityTime = millis();
    _targetDevice = deviceAddress;
    _targetParamCount = paramCount;
    _currentParam = 1; // Parameters are 1-indexed
    _currentChunk = 0;
    _paramChunksLen = 0;
    _onParamInfo = onParam;
    _onParamComplete = onComplete;
    
    DBGLN("CRSF: Loading %d params from device 0x%02X", paramCount, deviceAddress);
    
    // Request first parameter, first chunk
    sendParamRead(_targetDevice, _currentParam, _currentChunk);
}

void CRSFParams::handleParamEntry() {
    if (_state != CRSF_STATE_READING_PARAMS) {
        DBGLN("CRSF: Ignoring PARAM_ENTRY (wrong state: %d, need %d)", _state, CRSF_STATE_READING_PARAMS);
        return;
    }

    DBGLN("CRSF: Handling PARAM_ENTRY");
    
    // Parse PARAM_ENTRY frame
    // Frame structure: [SYNC] [LEN] [TYPE] [DEST] [ORIGIN] [PARAM_NUM] [CHUNKS_REMAINING] [CHUNK_DATA...] [CRC]
    
    uint8_t frameLen = _rxBuffer[1];
    uint8_t origin = _rxBuffer[4];
    
    // Verify this is from our target device
    if (origin != _targetDevice) {
        DBGLN("CRSF: Wrong origin 0x%02X (expected 0x%02X)", origin, _targetDevice);
        return;
    }
    
    uint8_t* payload = &_rxBuffer[5];
    uint8_t payloadLen = frameLen - 4;
    
    if (payloadLen < 2) return;
    
    uint8_t paramNumber = payload[0];
    uint8_t chunksRemaining = payload[1];
    uint8_t* chunkData = &payload[2];
    uint8_t chunkDataLen = payloadLen - 2;
    
    DBGLN("  ParamNum=%d Chunk=%d/%d DataLen=%d", paramNumber, _currentChunk, _currentChunk + chunksRemaining, chunkDataLen);
    
    // Verify parameter number matches what we requested
    if (paramNumber != _currentParam) {
        DBGLN("CRSF: Unexpected param number %d (expected %d)", paramNumber, _currentParam);
        return;
    }

    // Sanity check: if this is the first chunk, reset the buffer
    if (_currentChunk == 0) {
        _paramChunksLen = 0;
    }

    // Check if we have enough space in the buffer
    if (_paramChunksLen + chunkDataLen > sizeof(_paramChunks)) {
        DBGLN("CRSF: Param buffer overflow! current=%d + new=%d > max=%d", _paramChunksLen, chunkDataLen, sizeof(_paramChunks));
        completeRequest(false, "Parameter too large");
        return;
    }

    // Append chunk data
    memcpy(&_paramChunks[_paramChunksLen], chunkData, chunkDataLen);
    _paramChunksLen += chunkDataLen;
    
    _currentChunk++;
    _lastActivityTime = millis();
    
    if (chunksRemaining > 0) {
        // Request next chunk
        sendParamRead(_targetDevice, _currentParam, _currentChunk);
    } else {
        // Parameter complete, parse it
        CRSFParamInfo param;
        memset(&param, 0, sizeof(param));
        param.paramNumber = paramNumber;

        parseParamInfo(param, _paramChunks, _paramChunksLen);

        // Notify callback
        if (_onParamInfo) {
            _onParamInfo(param);
        }

        // Move to next parameter or complete
        _paramChunksLen = 0;
        _currentChunk = 0;
        _currentParam++;
        
        if (_currentParam <= _targetParamCount) {
            // Request next parameter
            sendParamRead(_targetDevice, _currentParam, 0);
        } else {
            // All parameters loaded
            completeRequest(true);
        }
    }
}

//=========================================================
// Parameter Writing
//=========================================================

void CRSFParams::writeParameter(uint8_t deviceAddress, uint8_t paramNumber,
                               const uint8_t* value, uint8_t valueLen,
                               CompletionCallback onComplete) {
    if (_state != CRSF_STATE_IDLE) {
        if (onComplete) onComplete(false);
        return;
    }
    
    _state = CRSF_STATE_WRITING_PARAM;
    _requestStartTime = millis();
    _lastActivityTime = millis();
    _targetDevice = deviceAddress;
    _currentParam = paramNumber;
    _onWriteComplete = onComplete;
    
    DBGLN("CRSF: Writing param %d on device 0x%02X", paramNumber, deviceAddress);
    
    sendParamWrite(deviceAddress, paramNumber, value, valueLen);
    
    // For now, assume write is successful after sending
    // A more robust implementation would wait for acknowledgment
    // Complete after a short delay
    completeRequest(true);
}

//=========================================================
// Parameter Parsing
//=========================================================

void CRSFParams::parseParamInfo(CRSFParamInfo& param, const uint8_t* data, uint16_t len) {
    if (len < 3) return;
    
    uint16_t offset = 0;
    
    // Common header: [PARENT_FOLDER] [TYPE_BYTE] [NAME\0]
    param.parentFolder = data[offset++];
    uint8_t typeByte = data[offset++];
    param.type = typeByte & 0x3F;  // Lower 6 bits
    param.isHidden = (typeByte & CRSF_PARAM_HIDDEN) != 0;
    
    // Parse name
    uint16_t nameLen = parseNullTerminatedString(&data[offset], len - offset, param.name, sizeof(param.name));
    offset += nameLen + 1;  // +1 for null terminator
    
    // Parse type-specific data
    switch (param.type) {
        case CRSF_PARAM_TYPE_UINT8:
            if (offset + 4 <= len) {
                param.numValue = data[offset++];
                param.numMin = data[offset++];
                param.numMax = data[offset++];
                param.numDefault = data[offset++];
                parseNullTerminatedString(&data[offset], len - offset, param.unit, sizeof(param.unit));
            }
            break;
            
        case CRSF_PARAM_TYPE_INT8:
            if (offset + 4 <= len) {
                param.numValue = (int8_t)data[offset++];
                param.numMin = (int8_t)data[offset++];
                param.numMax = (int8_t)data[offset++];
                param.numDefault = (int8_t)data[offset++];
                parseNullTerminatedString(&data[offset], len - offset, param.unit, sizeof(param.unit));
            }
            break;
            
        case CRSF_PARAM_TYPE_UINT16:
            if (offset + 8 <= len) {
                param.numValue = (data[offset] << 8) | data[offset + 1]; offset += 2;
                param.numMin = (data[offset] << 8) | data[offset + 1]; offset += 2;
                param.numMax = (data[offset] << 8) | data[offset + 1]; offset += 2;
                param.numDefault = (data[offset] << 8) | data[offset + 1]; offset += 2;
                parseNullTerminatedString(&data[offset], len - offset, param.unit, sizeof(param.unit));
            }
            break;
            
        case CRSF_PARAM_TYPE_INT16:
            if (offset + 8 <= len) {
                param.numValue = (int16_t)((data[offset] << 8) | data[offset + 1]); offset += 2;
                param.numMin = (int16_t)((data[offset] << 8) | data[offset + 1]); offset += 2;
                param.numMax = (int16_t)((data[offset] << 8) | data[offset + 1]); offset += 2;
                param.numDefault = (int16_t)((data[offset] << 8) | data[offset + 1]); offset += 2;
                parseNullTerminatedString(&data[offset], len - offset, param.unit, sizeof(param.unit));
            }
            break;
            
        case CRSF_PARAM_TYPE_UINT32:
            if (offset + 16 <= len) {
                param.numValue = parseUint32BE(&data[offset]); offset += 4;
                param.numMin = parseUint32BE(&data[offset]); offset += 4;
                param.numMax = parseUint32BE(&data[offset]); offset += 4;
                param.numDefault = parseUint32BE(&data[offset]); offset += 4;
                parseNullTerminatedString(&data[offset], len - offset, param.unit, sizeof(param.unit));
            }
            break;
            
        case CRSF_PARAM_TYPE_INT32:
            if (offset + 16 <= len) {
                param.numValue = parseInt32BE(&data[offset]); offset += 4;
                param.numMin = parseInt32BE(&data[offset]); offset += 4;
                param.numMax = parseInt32BE(&data[offset]); offset += 4;
                param.numDefault = parseInt32BE(&data[offset]); offset += 4;
                parseNullTerminatedString(&data[offset], len - offset, param.unit, sizeof(param.unit));
            }
            break;
            
        case CRSF_PARAM_TYPE_FLOAT:
            if (offset + 21 <= len) {
                // FLOAT stores values as fixed-point integers
                param.floatValue = (float)parseInt32BE(&data[offset]); offset += 4;
                param.floatMin = (float)parseInt32BE(&data[offset]); offset += 4;
                param.floatMax = (float)parseInt32BE(&data[offset]); offset += 4;
                param.floatDefault = (float)parseInt32BE(&data[offset]); offset += 4;
                param.decimalPoint = data[offset++];
                param.stepSize = (float)parseInt32BE(&data[offset]); offset += 4;
                parseNullTerminatedString(&data[offset], len - offset, param.unit, sizeof(param.unit));
                
                // Convert from fixed-point
                float divisor = pow(10, param.decimalPoint);
                param.floatValue /= divisor;
                param.floatMin /= divisor;
                param.floatMax /= divisor;
                param.floatDefault /= divisor;
                param.stepSize /= divisor;
            }
            break;
            
        case CRSF_PARAM_TYPE_TEXT_SELECTION:
            {
                // Options are semicolon-separated, null-terminated
                uint16_t optLen = parseNullTerminatedString(&data[offset], len - offset, param.options, sizeof(param.options));
                offset += optLen + 1;
                
                if (offset + 4 <= len) {
                    param.selectValue = data[offset++];
                    param.selectMin = data[offset++];
                    param.selectMax = data[offset++];
                    param.selectDefault = data[offset++];
                    parseNullTerminatedString(&data[offset], len - offset, param.unit, sizeof(param.unit));
                }
            }
            break;
            
        case CRSF_PARAM_TYPE_STRING:
            {
                uint16_t strLen = parseNullTerminatedString(&data[offset], len - offset, param.stringValue, sizeof(param.stringValue));
                offset += strLen + 1;
                if (offset < len) {
                    param.stringMaxLength = data[offset];
                }
            }
            break;
            
        case CRSF_PARAM_TYPE_FOLDER:
            // Folder has no additional data
            break;
            
        case CRSF_PARAM_TYPE_INFO:
            parseNullTerminatedString(&data[offset], len - offset, param.infoValue, sizeof(param.infoValue));
            break;
            
        case CRSF_PARAM_TYPE_COMMAND:
            if (offset + 2 <= len) {
                param.cmdStatus = data[offset++];
                param.cmdTimeout = data[offset++];
                parseNullTerminatedString(&data[offset], len - offset, param.cmdInfo, sizeof(param.cmdInfo));
            }
            break;
    }
    
    DBGLN("CRSF Param: #%d '%s' type=0x%02X parent=%d", 
          param.paramNumber, param.name, param.type, param.parentFolder);
}

//=========================================================
// Helper Functions
//=========================================================

uint16_t CRSFParams::parseNullTerminatedString(const uint8_t* data, uint16_t maxLen, 
                                               char* output, uint16_t outputSize) {
    uint16_t len = 0;
    while (len < maxLen && len < outputSize - 1 && data[len] != 0) {
        output[len] = (char)data[len];
        len++;
    }
    output[len] = '\0';
    return len;
}

uint32_t CRSFParams::parseUint32BE(const uint8_t* data) {
    return ((uint32_t)data[0] << 24) |
           ((uint32_t)data[1] << 16) |
           ((uint32_t)data[2] << 8) |
           ((uint32_t)data[3]);
}

int32_t CRSFParams::parseInt32BE(const uint8_t* data) {
    return (int32_t)parseUint32BE(data);
}

//=========================================================
// State Machine
//=========================================================

void CRSFParams::checkTimeout() {
    if (_state == CRSF_STATE_IDLE) return;
    
    unsigned long now = millis();
    unsigned long elapsed = now - _requestStartTime;
    
    switch (_state) {
        case CRSF_STATE_SCANNING:
            // Scan completes after timeout (we wait for all responses)
            if (elapsed >= CRSF_SCAN_TIMEOUT_MS) {
                DBGLN("CRSF: Scan complete, found %d devices", _discoveredDevices.size());
                completeRequest(true);
            }
            break;
            
        case CRSF_STATE_READING_PARAMS:
            // Check for per-parameter timeout
            if (now - _lastActivityTime > CRSF_PARAM_READ_TIMEOUT_MS) {
                snprintf(_lastError, sizeof(_lastError), "Timeout reading param %d", _currentParam);
                DBGLN("CRSF: %s", _lastError);
                completeRequest(false, _lastError);
            }
            break;
            
        case CRSF_STATE_WRITING_PARAM:
            if (now - _lastActivityTime > CRSF_PARAM_WRITE_TIMEOUT_MS) {
                snprintf(_lastError, sizeof(_lastError), "Timeout writing param %d", _currentParam);
                DBGLN("CRSF: %s", _lastError);
                completeRequest(false, _lastError);
            }
            break;
            
        default:
            break;
    }
}

void CRSFParams::completeRequest(bool success, const char* error) {
    CRSFRequestState prevState = _state;
    _state = CRSF_STATE_IDLE;
    
    if (error) {
        strncpy(_lastError, error, sizeof(_lastError) - 1);
    }
    
    switch (prevState) {
        case CRSF_STATE_SCANNING:
            if (_onScanComplete) {
                auto callback = _onScanComplete;
                _onScanComplete = nullptr;
                _onDeviceInfo = nullptr;
                callback(success);
            }
            break;
            
        case CRSF_STATE_READING_PARAMS:
            if (_onParamComplete) {
                auto callback = _onParamComplete;
                _onParamComplete = nullptr;
                _onParamInfo = nullptr;
                callback(success);
            }
            break;
            
        case CRSF_STATE_WRITING_PARAM:
            if (_onWriteComplete) {
                auto callback = _onWriteComplete;
                _onWriteComplete = nullptr;
                callback(success);
            }
            break;
            
        default:
            break;
    }
}
