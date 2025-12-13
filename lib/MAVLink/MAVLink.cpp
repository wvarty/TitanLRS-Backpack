#if defined(MAVLINK_ENABLED)
#include <Arduino.h>
#include "MAVLink.h"
#include <config.h>
#include "logging.h"
#include "msp.h"
#include "msptypes.h"

void
MAVLink::ProcessMAVLinkFromTX(uint8_t c)
{
    mavlink_status_t status;
    mavlink_message_t msg;

    if (mavlink_frame_char(MAVLINK_COMM_0, c, &msg, &status) != MAVLINK_FRAMING_INCOMPLETE)
    {
        if (mavlink_to_gcs_buf_count >= MAVLINK_BUF_SIZE)
        {
            // Cant fit any more msgs in the queue,
            // drop the oldest msg and start overwriting
            mavlink_stats.overflows_downlink++;
            mavlink_to_gcs_buf_count = 0;
        }

        // Track gaps in the sequence number, add to a dropped counter
        uint8_t seq = msg.seq;
        if (expectedSeqSet && seq != expectedSeq)
        {
            // account for rollovers
            if (seq < expectedSeq)
            {
                mavlink_stats.drops_downlink += (UINT8_MAX - expectedSeq) + seq;
            }
            else
            {
                mavlink_stats.drops_downlink += seq - expectedSeq;
            }
        }
        expectedSeq = seq + 1;
        expectedSeqSet = true;

        // Queue the msgs, to forward to peers
        mavlink_to_gcs_buf[mavlink_to_gcs_buf_count] = msg;
        mavlink_to_gcs_buf_count++;
        mavlink_stats.packets_downlink++;
    }
}

void
MAVLink::ProcessMAVLinkFromTX(uint8_t *data, uint16_t len)
{
    for (uint16_t i = 0; i < len; i++)
    {
        ProcessMAVLinkFromTX(data[i]);
    }
}

void
MAVLink::ProcessMAVLinkFromGCS(uint8_t *data, uint16_t len)
{
    mavlink_status_t status;
    mavlink_message_t msg;

    for (uint16_t i = 0; i < len; i++)
    {
        if (mavlink_frame_char(MAVLINK_COMM_1, data[i], &msg, &status) != MAVLINK_FRAMING_INCOMPLETE)
        {
            // Convert the message to a buffer
            uint8_t buf[MAVLINK_MAX_PACKET_LEN];
            uint16_t bufLen = mavlink_msg_to_send_buffer(buf, &msg);
            
            // Send the message to the TX via MSP-embedded MAVLink frame
            sendMAVLinkFrameToSerial(buf, bufLen);
            mavlink_stats.packets_uplink++;
        }
    }
}

void
MAVLink::sendMAVLinkFrameToSerial(const uint8_t *data, uint16_t size)
{
    // MAVLink frames can be up to 280 bytes (255 payload + 25 overhead)
    // Ensure it fits in the MSP payload
    if (size > 280)
    {
        DBGLN("MAVLink frame exceeds max length: %d", size);
        return;
    }

    mspPacket_t packet;
    packet.reset();
    packet.makeCommand();
    packet.function = MSP_ELRS_BACKPACK_MAVLINK_FRAME;

    for (uint16_t i = 0; i < size; ++i)
    {
        packet.addByte(data[i]);
    }

    MSP::sendPacket(&packet, &Serial);
}
#endif
