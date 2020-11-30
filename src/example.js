/* global $, JitsiMeetJS */

const options = {
    serviceUrl: 'wss://beta.meet.jit.si/xmpp-websocket',
    hosts: {
        domain: 'beta.meet.jit.si',
        muc: 'conference.beta.meet.jit.si', // FIXME: use XEP-0030
        focus: 'focus.beta.meet.jit.si',
        call_control: 'callcontrol.beta.meet.jit.si',
        jirecon: 'jirecon.beta.meet.jit.si',
    },
    bosh: '//beta.meet.jit.si/http-bind', // FIXME: use xep-0156 for that
    clientNode: "https://beta.jitsi.org/jitsimeet",
    useStunTurn: true
};

const confOptions = {
    openBridgeChannel: true,
};

const initOptions = {
    enableTalkWhileMuted: true,
    enableNoAudioDetection: true,
    enableNoisyMicDetection: true,
    disableAudioLevels: false,
    enableAnalyticsLogging: false
}

let connection = null;
let isJoined = false;
let room = null;

let localTracks = [];
const remoteTracks = {};
let currentSpeakerId = null;
const audioCriticalLevel = 0.01;
let isVideo = true;
let isMicMuted = false;
let isCameraOff = false;
let isRecord = false;

/**
 * Handles local tracks.
 * @param tracks Array with JitsiTrack objects
 */
function onLocalTracks(tracks) {
    console.log(">>>local tracks", tracks);
    localTracks = tracks;
    for (let i = 0; i < localTracks.length; i++) {
        localTracks[i].addEventListener(
            JitsiMeetJS.events.track.TRACK_AUDIO_LEVEL_CHANGED,
            audioLevel => console.log(`Audio Level local: ${audioLevel}`));
        localTracks[i].addEventListener(
            JitsiMeetJS.events.track.TRACK_MUTE_CHANGED,
            () => console.log('local track muted'));
        localTracks[i].addEventListener(
            JitsiMeetJS.events.track.LOCAL_TRACK_STOPPED,
            () => console.log('local track stoped'));
        localTracks[i].addEventListener(
            JitsiMeetJS.events.track.TRACK_AUDIO_OUTPUT_CHANGED,
            deviceId =>
                console.log(
                    `track audio output device was changed to ${deviceId}`));

        localTracks[i].on(JitsiMeetJS.events.track.DOMINANT_SPEAKER_CHANGED, onDominantSpeaker);

        if (localTracks[i].getType() === 'video') {
            // $('body').append(`<video autoplay='1' id='localVideo' />`);
            localTracks[i].attach($(`#localVideo`)[0]);
            localTracks[i].attach($(`#currentVideo`)[0]);
        } else {
            // $('body').append(
            //     `<audio autoplay='1' muted='true' id='localAudio' />`);
            localTracks[i].attach($(`#localAudio`)[0]);
        }
        if (isJoined) {
            room.addTrack(localTracks[i]);
        }
    }
}

/**
 * Handles remote tracks
 * @param track JitsiTrack object
 */
function onRemoteTrack(track) {
    if (track.isLocal()) {
        console.log(">>>local track", track);
        return;
    }
    const participant = track.getParticipantId();
    const type = track.getType();

    if (type === 'video' && participant == currentSpeakerId) {
        track.attach($(`#currentVideo`)[0]);
    }

    if (!remoteTracks[participant]) {
        remoteTracks[participant] = [];
    }

    let isFind = false;
    for (let i = 0; i < remoteTracks[participant].length; i++) {
        if (remoteTracks[participant][i].getType() === track.getType()) {
            remoteTracks[participant][i] = track;
            isFind = true;
            break;
        }
    }

    if (isFind === false) {
        remoteTracks[participant].push(track);
    }

    track.addEventListener(
        JitsiMeetJS.events.track.TRACK_AUDIO_LEVEL_CHANGED,
        audioLevel => console.log(`Audio Level remote: ${audioLevel}`));
    track.addEventListener(
        JitsiMeetJS.events.track.TRACK_MUTE_CHANGED,
        () => console.log('remote track muted'));
    track.addEventListener(
        JitsiMeetJS.events.track.LOCAL_TRACK_STOPPED,
        () => console.log('remote track stoped'));
    track.addEventListener(JitsiMeetJS.events.track.TRACK_AUDIO_OUTPUT_CHANGED,
        deviceId =>
            console.log(
                `track audio output device was changed to ${deviceId}`));

    track.on(JitsiMeetJS.events.track.DOMINANT_SPEAKER_CHANGED, onDominantSpeaker);

    if ($(`#${participant}`).length === 0) {
        console.log(">>>$(`#${participant}`).length", $(`#${participant}`).length);
        $('#remote_area').append(`<div class='remoteitem' id='${participant}' onclick='selectedRemoteTrack(this.id)'></div>`)
    }

    const id = participant + track.getType();

    if (track.getType() === 'video') {
        console.log(">>>remote video item", track);
        if ($(`#${participant}video`).length === 0) {
            $(`#${participant}`).append(`<video class='remotevideo' autoplay='1' id='${participant}video' />`);
        }
    } else {
        console.log(">>>remote audio item", track);
        if ($(`#${participant}audio`).length === 0) {
            $(`#${participant}`).append(`<audio autoplay='1' id='${participant}audio' />`);
        }
    }
    track.attach($(`#${id}`)[0]);
}

/**
 * Handles remote tracks
 * @param track JitsiTrack object
 */
function onRemoveTrack(track) {

}

/**
 * That function is executed when the conference is joined
 */
function onConferenceJoined() {
    console.log('conference joined!');
    isJoined = true;
    for (let i = 0; i < localTracks.length; i++) {
        room.addTrack(localTracks[i]);
    }
}

/**
 *
 * @param id
 */
function onUserLeft(id) {
    console.log('>>>user left1', id);
    if (!remoteTracks[id]) {
        return;
    }
    const tracks = remoteTracks[id];

    for (let i = 0; i < tracks.length; i++) {
        const type = tracks[i].getType();
        tracks[i].detach($(`#${id + type}`)[0]);
    }

    $(`#${id.toString()}`).remove();
    delete remoteTracks[id];
    console.log('>>>user left2', id);
}

/**
 *That function is called when a user speak a louldly.
 * @param id
 */
function onDominantSpeaker(id) {
    console.log(">>>>DominantSpeaker id", id);

    if (!remoteTracks[id]) {
        return;
    }

    console.log(">>>>DominantSpeaker track", remoteTracks[id]);
    for (let i = 0; i < remoteTracks[id].length; i++) {
        if (remoteTracks[id][i].getType() === "video") {
            remoteTracks[id][i].attach($(`#currentVideo`)[0]);
            currentSpeakerId = id;
        }
    }
}

/**
 *That function is called when a user speak a louldly.
 * @param userID
 * @param audioLevel
 */
function onAudioLevelChanged(userID, audioLeveld) {
    if (!remoteTracks[userID]) {
        return;
    }

    if (currentSpeakerId === userID) {
        return;
    }

    if (audioLeveld < audioCriticalLevel) {
        return;
    }

    currentSpeakerId = userID;
    console.log(">>>>onAudioLevelChanged", audioLeveld, remoteTracks[userID]);
    for (let i = 0; i < remoteTracks[userID].length; i++) {
        if (remoteTracks[userID][i].getType() === "video") {
            remoteTracks[userID][i].attach($(`#currentVideo`)[0]);
        }
    }
}

/**
 * That function is called when connection is established successfully
 */
function onConnectionSuccess() {
    room = connection.initJitsiConference('123123', confOptions);
    room.on(JitsiMeetJS.events.conference.TRACK_ADDED, onRemoteTrack);
    room.on(JitsiMeetJS.events.conference.TRACK_REMOVED, onRemoveTrack);
    room.on(
        JitsiMeetJS.events.conference.CONFERENCE_JOINED,
        onConferenceJoined);
    room.on(JitsiMeetJS.events.conference.USER_JOINED, id => {
        console.log('user join');
        remoteTracks[id] = [];
    });
    room.on(JitsiMeetJS.events.conference.USER_LEFT, onUserLeft);
    room.on(JitsiMeetJS.events.conference.TRACK_MUTE_CHANGED, track => {
        console.log(`${track.getType()} - ${track.isMuted()}`);
    });
    room.on(
        JitsiMeetJS.events.conference.DISPLAY_NAME_CHANGED,
        (userID, displayName) => console.log(`${userID} - ${displayName}`));
    room.on(
        JitsiMeetJS.events.conference.TRACK_AUDIO_LEVEL_CHANGED, onAudioLevelChanged);
    // (userID, audioLevel) => console.log(`${userID} - ${audioLevel}`));
    room.on(
        JitsiMeetJS.events.conference.PHONE_NUMBER_CHANGED,
        () => console.log(`${room.getPhoneNumber()} - ${room.getPhonePin()}`));
    room.on(JitsiMeetJS.events.conference.DOMINANT_SPEAKER_CHANGED, onDominantSpeaker);
    room.join();
}

/**
 * This function is called when the connection fail.
 */
function onConnectionFailed() {
    console.error('Connection Failed!');
}

/**
 * This function is called when the connection fail.
 */
function onDeviceListChanged(devices) {
    console.info('current devices', devices);
}

/**
 * This function is called when we disconnect.
 */
function disconnect() {
    console.log('disconnect!');
    connection.removeEventListener(
        JitsiMeetJS.events.connection.CONNECTION_ESTABLISHED,
        onConnectionSuccess);
    connection.removeEventListener(
        JitsiMeetJS.events.connection.CONNECTION_FAILED,
        onConnectionFailed);
    connection.removeEventListener(
        JitsiMeetJS.events.connection.CONNECTION_DISCONNECTED,
        disconnect);
}

/**
 *
 */
function unload() {
    for (let i = 0; i < localTracks.length; i++) {
        localTracks[i].dispose();
    }
    room.leave();
    connection.disconnect();
}

/**
 *
 */
function switchVideo() { // eslint-disable-line no-unused-vars
    isVideo = !isVideo;
    let text = isVideo ? 'Screen Share' : 'Local Camera';
    $('#video_switch_button').html(text);

    if (localTracks[1]) {
        localTracks[1].dispose();
        localTracks.pop();
    }

    JitsiMeetJS.createLocalTracks({
        devices: [isVideo ? 'video' : 'desktop']
    })
        .then(tracks => {
            console.log('>>>>>>switchVideo', tracks);
            localTracks.push(tracks[0]);
            localTracks[1].addEventListener(
                JitsiMeetJS.events.track.TRACK_MUTE_CHANGED,
                () => console.log('>>>>>>local track muted'));
            localTracks[1].addEventListener(
                JitsiMeetJS.events.track.LOCAL_TRACK_STOPPED, () => { isVideo === false ? stopScreenShare() : null });
            // () => console.log('>>>>>>local track stoped'));
            localTracks[1].attach($('#localVideo')[0]);
            localTracks[1].attach($('#currentVideo')[0]);
            currentSpeakerId = localTracks[1].getParticipantId();
            room.addTrack(localTracks[1]);
        })
        .catch(error => stopScreenShare());
}


function stopScreenShare() {
    console.log(">>>>>>>>> stoped screen share");
    isVideo = true;
    let text = 'Screen Share';
    $('#video_switch_button').html(text);

    if (localTracks[1]) {
        localTracks[1].dispose();
        localTracks.pop();
    }

    JitsiMeetJS.createLocalTracks({
        devices: ['video']
    })
        .then(tracks => {
            console.log('>>>>>>stopLocalTrack', tracks);
            localTracks.push(tracks[0]);
            localTracks[1].addEventListener(
                JitsiMeetJS.events.track.TRACK_MUTE_CHANGED,
                () => console.log('>>>>>>local track muted'));
            localTracks[1].addEventListener(
                JitsiMeetJS.events.track.LOCAL_TRACK_STOPPED,
                () => console.log('>>>>>>local track stoped'));
            localTracks[1].attach($('#localVideo')[0]);
            localTracks[1].attach($('#currentVideo')[0]);
            currentSpeakerId = localTracks[1].getParticipantId();
            room.addTrack(localTracks[1]);
        })
        .catch(error => console.log('>>>>>error', error));
}
/**
 *
 * @param selected
 */
function changeAudioOutput(selected) { // eslint-disable-line no-unused-vars
    JitsiMeetJS.mediaDevices.setAudioOutputDevice(selected.value);
}

function turnOffLocalCamera() {
    isCameraOff = true;
    handleCameraButtons();
}

function turnOnLocalCamera() {
    isCameraOff = false;
    handleCameraButtons();
}

function handleCameraButtons() {
    let track = null;
    for (let i = 0; i < localTracks.length; i++) {
        if (localTracks[i].getType() === "video") {
            track = localTracks[i];
        }
    }

    if (isCameraOff) {
        $('#turn_off_camera_button').attr('disabled', true);
        $('#turn_on_camera_button').attr('disabled', false);
        if (track !== null) {
            track.mute();
        }

    } else {
        $('#turn_off_camera_button').attr('disabled', false);
        $('#turn_on_camera_button').attr('disabled', true);
        if (track !== null) {
            track.unmute();
        }
    }
}

function muteLocalMic() {
    isMicMuted = true;
    handleMicButtons();
}

function unmuteLocalMic() {
    isMicMuted = false;
    handleMicButtons();
}

function handleMicButtons() {
    let track = null;
    for (let i = 0; i < localTracks.length; i++) {
        if (localTracks[i].getType() === "audio") {
            track = localTracks[i];
        }
    }

    if (isMicMuted) {
        $('#mute_mic_button').attr('disabled', true);
        $('#unmute_mic_button').attr('disabled', false);
        if (track !== null) {
            track.mute();
        }
    } else {
        $('#mute_mic_button').attr('disabled', false);
        $('#unmute_mic_button').attr('disabled', true);
        if (track !== null) {
            track.unmute();
        }
    }
}

function startRecord() {
    isRecord = true;
    handleRecordButtons();
}

function stopRecord() {
    isRecord = false;
    handleRecordButtons();
}

function handleRecordButtons() {
    if (isRecord) {
        $('#record_start_button').attr('disabled', true);
        $('#record_stop_button').attr('disabled', false);
    } else {
        $('#record_start_button').attr('disabled', false);
        $('#record_stop_button').attr('disabled', true);
    }
}

function selectedLocalTrack() {
    if (currentSpeakerId == localTracks[1].getParticipantId()) {
        return;
    }

    console.log(">>>>selectedLocalTrack clicked");
    currentSpeakerId = localTracks[1].getParticipantId();
    localTracks[1].attach($('#currentVideo')[0]);
}

function selectedRemoteTrack(id) {
    console.log(">>>>selectedRemoteTrack clicked");
    if (currentSpeakerId == id) {
        return;
    }

    if (!remoteTracks[id]) {
        return;
    }

    console.log(">>>>selectedRemoteTrack track", remoteTracks[id]);
    for (let i = 0; i < remoteTracks[id].length; i++) {
        if (remoteTracks[id][i].getType() === "video") {
            remoteTracks[id][i].attach($(`#currentVideo`)[0]);
            currentSpeakerId = id;
        }
    }
}

//jitsi serer config
$(window).bind('beforeunload', unload);
$(window).bind('unload', unload);


JitsiMeetJS.init(initOptions);

connection = new JitsiMeetJS.JitsiConnection(null, null, options);

connection.addEventListener(
    JitsiMeetJS.events.connection.CONNECTION_ESTABLISHED,
    onConnectionSuccess);
connection.addEventListener(
    JitsiMeetJS.events.connection.CONNECTION_FAILED,
    onConnectionFailed);
connection.addEventListener(
    JitsiMeetJS.events.connection.CONNECTION_DISCONNECTED,
    disconnect);

JitsiMeetJS.mediaDevices.addEventListener(
    JitsiMeetJS.events.mediaDevices.DEVICE_LIST_CHANGED,
    onDeviceListChanged);

connection.connect();

JitsiMeetJS.createLocalTracks({ devices: ['audio', 'video'] })
    .then(onLocalTracks)
    .catch(error => {
        throw error;
    });

if (JitsiMeetJS.mediaDevices.isDeviceChangeAvailable('output')) {
    JitsiMeetJS.mediaDevices.enumerateDevices(devices => {
        const audioOutputDevices
            = devices.filter(d => d.kind === 'audiooutput');

        if (audioOutputDevices.length > 1) {
            $('#audioOutputSelect').html(
                audioOutputDevices
                    .map(
                        d =>
                            `<option value="${d.deviceId}">${d.label}</option>`)
                    .join('\n'));

            $('#audioOutputSelectWrapper').show();
        }
    });
}
