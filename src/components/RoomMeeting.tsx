import { useEffect, useRef, useState } from "react";
import {
  LoaderCircle,
  Mic,
  MicOff,
  MonitorUp,
  Phone,
  PhoneOff,
  Share2,
  Video,
  VideoOff,
  X,
} from "lucide-react";
import type { User } from "firebase/auth";
import {
  closeStudyRoom,
  endRoomMeeting,
  joinRoomMeeting,
  leaveRoomMeeting,
  publishRoomMeetingAnswer,
  publishRoomMeetingCandidate,
  publishRoomMeetingOffer,
  refreshRoomMeetingPresence,
  roomMeetingSignalId,
  startRoomMeeting,
  subscribeMeetingParticipants,
  subscribeRoomMeeting,
  subscribeRoomMeetingCandidates,
  subscribeRoomMeetingSignal,
  type RoomMeeting as RoomMeetingInfo,
  type RoomMeetingParticipant,
  type RoomSummary,
} from "../services/firebaseData";

interface RoomMeetingProps {
  room: RoomSummary;
  user: User;
  onInvite: () => void;
  onNotice: (message: string) => void;
}

const activeWindowMs = 45_000;

export default function RoomMeeting({ room, user, onInvite, onNotice }: RoomMeetingProps) {
  const [meeting, setMeeting] = useState<RoomMeetingInfo | null>(null);
  const [participants, setParticipants] = useState<RoomMeetingParticipant[]>([]);
  const [joined, setJoined] = useState(false);
  const [participantSessionId, setParticipantSessionId] = useState("");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const peerConnections = useRef(new Map<string, RTCPeerConnection>());
  const leaving = useRef(false);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  localStreamRef.current = localStream;
  screenStreamRef.current = screenStream;

  const activeParticipants = participants.filter((participant) =>
    participant.lastSeenAt
    && (!meeting?.startedAt || participant.lastSeenAt >= meeting.startedAt)
    && Date.now() - participant.lastSeenAt.getTime() < activeWindowMs);

  useEffect(() => subscribeRoomMeeting(room.id, setMeeting, (caught) => setError(caught.message)), [room.id]);

  useEffect(() => {
    if (meeting?.status !== "active") {
      setParticipants([]);
      return;
    }
    return subscribeMeetingParticipants(room.id, setParticipants, (caught) => setError(caught.message));
  }, [room.id, meeting?.status]);

  useEffect(() => {
    if (!joined || !localStream || !participantSessionId || meeting?.status !== "active") return;
    let disposed = false;
    const peers = new Map<string, {
      connection: RTCPeerConnection;
      stop: () => void;
    }>();

    const connect = (participant: RoomMeetingParticipant) => {
      if (participant.uid === user.uid || !participant.sessionId || peers.has(participant.uid)) return;
      const connection = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      const signalId = roomMeetingSignalId(user.uid, participantSessionId, participant.uid, participant.sessionId);
      const isOfferer = user.uid.localeCompare(participant.uid) < 0;
      const pendingCandidates: RTCIceCandidateInit[] = [];
      const seenCandidates = new Set<string>();
      let offerApplied = false;
      let answerApplied = false;
      let applyingDescription = false;

      for (const track of localStream.getAudioTracks()) connection.addTrack(track, localStream);
      const activeScreen = screenStreamRef.current;
      const outgoingVideo = activeScreen?.getVideoTracks()[0] ?? localStream.getVideoTracks()[0];
      if (outgoingVideo) connection.addTrack(outgoingVideo, activeScreen ?? localStream);
      else connection.addTransceiver("video", { direction: "sendrecv" });

      connection.ontrack = (event) => {
        const stream = event.streams[0] ?? new MediaStream([event.track]);
        setRemoteStreams((current) => ({ ...current, [participant.uid]: stream }));
      };
      connection.onicecandidate = (event) => {
        if (!event.candidate || disposed) return;
        void publishRoomMeetingCandidate(room.id, signalId, user.uid, participant.uid, event.candidate)
          .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Could not send a meeting connection candidate."));
      };
      connection.onconnectionstatechange = () => {
        if (connection.connectionState === "failed") {
          setError(`Could not connect to ${participant.name}. The network may block direct peer-to-peer calls.`);
        }
      };

      const flushCandidates = async () => {
        while (pendingCandidates.length && connection.remoteDescription) {
          const candidate = pendingCandidates.shift();
          if (candidate) await connection.addIceCandidate(new RTCIceCandidate(candidate));
        }
      };

      const stopSignal = subscribeRoomMeetingSignal(room.id, signalId, (signal) => {
        if (!signal || disposed || applyingDescription) return;
        const receivedOffer = signal.offer;
        const receivedAnswer = signal.answer;
        if (!isOfferer && receivedOffer && !offerApplied) {
          offerApplied = true;
          applyingDescription = true;
          void (async () => {
            try {
              await connection.setRemoteDescription(new RTCSessionDescription(receivedOffer));
              await flushCandidates();
              const answer = await connection.createAnswer();
              await connection.setLocalDescription(answer);
              await publishRoomMeetingAnswer(room.id, signalId, answer);
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : "Could not answer the meeting call.");
            } finally {
              applyingDescription = false;
            }
          })();
        } else if (isOfferer && receivedAnswer && !answerApplied) {
          answerApplied = true;
          applyingDescription = true;
          void connection.setRemoteDescription(new RTCSessionDescription(receivedAnswer))
            .then(flushCandidates)
            .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Could not connect the meeting call."))
            .finally(() => { applyingDescription = false; });
        }
      }, (caught) => setError(caught.message));

      const stopCandidates = subscribeRoomMeetingCandidates(room.id, signalId, user.uid, (candidates) => {
        for (const item of candidates) {
          if (item.fromUid !== participant.uid || seenCandidates.has(item.id)) continue;
          seenCandidates.add(item.id);
          if (connection.remoteDescription) {
            void connection.addIceCandidate(new RTCIceCandidate(item.candidate))
              .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Could not add a meeting network candidate."));
          } else {
            pendingCandidates.push(item.candidate);
          }
        }
      }, (caught) => setError(caught.message));

      peers.set(participant.uid, {
        connection,
        stop: () => {
          stopSignal();
          stopCandidates();
          connection.close();
          peerConnections.current.delete(participant.uid);
        },
      });
      peerConnections.current.set(participant.uid, connection);

      if (isOfferer) {
        void (async () => {
          try {
            const offer = await connection.createOffer();
            await connection.setLocalDescription(offer);
            await publishRoomMeetingOffer(room.id, signalId, user.uid, participant.uid, offer);
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Could not start the peer-to-peer connection.");
          }
        })();
      }
    };

    const stopParticipants = subscribeMeetingParticipants(room.id, (next) => {
      if (disposed) return;
      const alive = next.filter((participant) =>
        participant.lastSeenAt && Date.now() - participant.lastSeenAt.getTime() < activeWindowMs);
      for (const participant of alive) connect(participant);
      const aliveIds = new Set(alive.map((participant) => participant.uid));
      for (const [uid, peer] of peers) {
        if (!aliveIds.has(uid)) {
          peer.stop();
          peers.delete(uid);
          setRemoteStreams((current) => {
            const updated = { ...current };
            delete updated[uid];
            return updated;
          });
        }
      }
    }, (caught) => setError(caught.message));

    return () => {
      disposed = true;
      stopParticipants();
      for (const peer of peers.values()) peer.stop();
      peerConnections.current.clear();
      setRemoteStreams({});
    };
  }, [joined, localStream, participantSessionId, meeting?.status, room.id, user.uid]);

  useEffect(() => {
    if (!joined || !meeting || meeting.status !== "active") return;
    const heartbeat = window.setInterval(() => {
      void refreshRoomMeetingPresence(user, room.id).catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : "Meeting presence could not be refreshed.");
      });
    }, 15_000);
    return () => window.clearInterval(heartbeat);
  }, [joined, meeting, room.id, user]);

  useEffect(() => {
    if (meeting?.status !== "ended" || !joined) return;
    void leave();
  }, [meeting?.status, joined]);

  useEffect(() => () => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
  }, []);

  async function start() {
    setBusy(true);
    setError("");
    try {
      await startRoomMeeting(user, room.id);
      await join();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start this study-room meeting.");
    } finally {
      setBusy(false);
    }
  }

  async function join() {
    setBusy(true);
    setError("");
    let stream: MediaStream | null = null;
    try {
      if (activeParticipants.length >= 4 && !activeParticipants.some((participant) => participant.uid === user.uid)) {
        throw new Error("This meeting already has four active participants.");
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("This browser does not support microphone and camera calls.");
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        onNotice("Camera access was unavailable; you joined with microphone audio.");
      }
      const sessionId = crypto.randomUUID();
      await joinRoomMeeting(user, room.id, sessionId);
      leaving.current = false;
      setParticipantSessionId(sessionId);
      setLocalStream(stream);
      setJoined(true);
    } catch (caught) {
      stream?.getTracks().forEach((track) => track.stop());
      setError(caught instanceof Error ? caught.message : "Could not join this meeting.");
    } finally {
      setBusy(false);
    }
  }

  async function leave() {
    if (leaving.current) return;
    leaving.current = true;
    const stream = localStreamRef.current;
    const sharedScreen = screenStreamRef.current;
    stream?.getTracks().forEach((track) => track.stop());
    sharedScreen?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    localStreamRef.current = null;
    screenStreamRef.current = null;
    setLocalStream(null);
    setScreenStream(null);
    setParticipantSessionId("");
    setJoined(false);
    setMuted(false);
    setCameraOff(false);
    try {
      await leaveRoomMeeting(user, room.id);
    } catch (caught) {
      setError(caught instanceof Error ? `You left the meeting, but presence cleanup failed: ${caught.message}` : "You left, but meeting presence cleanup failed.");
    } finally {
      leaving.current = false;
    }
  }

  async function endMeeting() {
    setBusy(true);
    setError("");
    try {
      await endRoomMeeting(user, room.id);
      if (joined) await leave();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not end the meeting.");
    } finally {
      setBusy(false);
    }
  }

  async function endRoom() {
    if (!window.confirm("End this study room for everyone? Members will lose access to its chat and shared board.")) return;
    setBusy(true);
    setError("");
    try {
      if (meeting?.status === "active") await endRoomMeeting(user, room.id);
      if (joined) await leave();
      await closeStudyRoom(room.id);
      onNotice("The study room has ended.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not end the study room.");
    } finally {
      setBusy(false);
    }
  }

  async function shareScreen() {
    if (!joined || !localStream || !navigator.mediaDevices?.getDisplayMedia) {
      setError("Screen sharing is not available in this browser.");
      return;
    }
    setError("");
    try {
      const shared = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = shared.getVideoTracks()[0];
      if (!screenTrack) throw new Error("No screen was selected.");
      const cameraTrack = localStream.getVideoTracks()[0];
      screenTrack.onended = () => void stopScreenShare();
      screenStreamRef.current = shared;
      setScreenStream(shared);
      await Promise.all([...peerConnections.current.values()].map((connection) => {
        const sender = connection.getSenders().find((item) => item.track?.kind === "video")
          ?? connection.getTransceivers().find((item) => item.receiver.track.kind === "video")?.sender;
        return sender?.replaceTrack(screenTrack) ?? Promise.resolve();
      }));
      if (!cameraTrack) onNotice("Your screen is now shared with the room.");
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "NotAllowedError") return;
      setError(caught instanceof Error ? caught.message : "Could not share your screen.");
    }
  }

  async function stopScreenShare() {
    const shared = screenStreamRef.current;
    if (!shared) return;
    const cameraTrack = localStreamRef.current?.getVideoTracks()[0] ?? null;
    screenStreamRef.current = null;
    setScreenStream(null);
    shared.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    await Promise.all([...peerConnections.current.values()].map((connection) => {
      const sender = connection.getSenders().find((item) => item.track?.kind === "video")
        ?? connection.getTransceivers().find((item) => item.receiver.track.kind === "video")?.sender;
      return sender?.replaceTrack(cameraTrack) ?? Promise.resolve();
    }));
  }

  function toggleMicrophone() {
    const enabled = muted;
    localStream?.getAudioTracks().forEach((track) => { track.enabled = enabled; });
    setMuted(!enabled);
  }

  function toggleCamera() {
    const enabled = cameraOff;
    localStream?.getVideoTracks().forEach((track) => { track.enabled = enabled; });
    setCameraOff(!enabled);
  }

  const isHost = room.createdBy === user.uid;
  const onlineParticipants = activeParticipants.length;

  return (
    <section className="room-meeting">
      <div className="room-meeting-header">
        <div>
          <span className="meeting-status"><i className={meeting?.status === "active" ? "room-live-indicator" : "meeting-idle-indicator"} />{meeting?.status === "active" ? "LIVE MEETING" : "STUDY ROOM"}</span>
          <strong>{meeting?.status === "active" ? `${onlineParticipants} online · up to 4 people` : "Meet, share your screen, and learn together"}</strong>
        </div>
        <div className="meeting-actions">
          <button className="quiet-button invite-button" onClick={onInvite}><Share2 size={14} /> Invite</button>
          {isHost && meeting?.status !== "active" && <button className="primary-button meeting-start-button" disabled={busy} onClick={() => void start()}>{busy ? <LoaderCircle size={14} className="spin" /> : <Phone size={14} />} Start meeting</button>}
          {meeting?.status === "active" && !joined && <button className="primary-button meeting-start-button" disabled={busy} onClick={() => void join()}>{busy ? <LoaderCircle size={14} className="spin" /> : <Phone size={14} />} Join meeting</button>}
          {joined && <button className="meeting-control-button" onClick={toggleMicrophone} title={muted ? "Turn microphone on" : "Mute microphone"} aria-label={muted ? "Turn microphone on" : "Mute microphone"}>{muted ? <MicOff size={16} /> : <Mic size={16} />}</button>}
          {joined && <button className="meeting-control-button" onClick={toggleCamera} title={cameraOff ? "Turn camera on" : "Turn camera off"} aria-label={cameraOff ? "Turn camera on" : "Turn camera off"}>{cameraOff ? <VideoOff size={16} /> : <Video size={16} />}</button>}
          {joined && !screenStream && <button className="meeting-control-button" onClick={() => void shareScreen()} title="Share screen" aria-label="Share screen"><MonitorUp size={16} /></button>}
          {joined && screenStream && <button className="meeting-control-button is-sharing" onClick={() => void stopScreenShare()} title="Stop sharing screen" aria-label="Stop sharing screen"><X size={16} /></button>}
          {joined && <button className="meeting-control-button meeting-leave-button" onClick={() => void leave()} title="Leave meeting" aria-label="Leave meeting"><PhoneOff size={16} /></button>}
          {isHost && meeting?.status === "active" && <button className="danger-button meeting-end-button" disabled={busy} onClick={() => void endMeeting()}>End meeting</button>}
          {isHost && <button className="danger-button meeting-end-button" disabled={busy} onClick={() => void endRoom()}>End room</button>}
        </div>
      </div>

      {meeting?.status === "active" && (
        <div className="meeting-video-grid">
          {joined && localStream && <VideoTile stream={screenStream ?? localStream} name={`${user.displayName ?? "You"} (you)`} muted />}
          {Object.entries(remoteStreams).map(([uid, stream]) => (
            <VideoTile key={uid} stream={stream} name={participants.find((participant) => participant.uid === uid)?.name ?? "Room member"} />
          ))}
          {joined && Object.keys(remoteStreams).length === 0 && <div className="meeting-empty-tile"><LoaderCircle className="spin" size={18} /> Waiting for other members to connect</div>}
          {!joined && <p className="meeting-join-hint">Join the meeting to enable your camera and microphone. Your browser will ask for permission.</p>}
        </div>
      )}
      {error && <p className="inline-error meeting-error" role="alert">{error}</p>}
    </section>
  );
}

function VideoTile({ stream, name, muted = false }: { stream: MediaStream; name: string; muted?: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (video.current) video.current.srcObject = stream;
  }, [stream]);
  return <div className="meeting-video-tile">
    <video ref={video} className="meeting-remote-video" autoPlay playsInline muted={muted} />
    <span>{name}</span>
  </div>;
}
