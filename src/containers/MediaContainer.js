import React from 'react'
export default class MediaBridge extends React.Component {
  constructor(props) {
    super(props);
  }
  state = {
    bridge: ''
  }
  componentWillMount() {
    // chrome polyfill for connection between the local device and a remote peer
    window.RTCPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection;
    this.props.media(this);
  }
  componentDidMount() {
    this.props.getUserMedia
      .then(stream => {
          this.localStream = stream;
          this.refs.localVideo.src = window.URL.createObjectURL(stream);
        });
    this.props.socket.on('message', this.onMessage);
    this.props.socket.on('hangup', this.onHangup);
  }
  componentWillUnmount() {
    this.props.media(null);
    if(this.localStream !== undefined) {
      this.localStream.getVideoTracks()[0].stop();
    }
    this.props.socket.emit('leave');
  }
  onHangup = () => {
    this.setState({bridge: ''});
  }
  onMessage = message => {
      if (message.type === 'offer') {
          // set remote description and answer
          this.pc.setRemoteDescription(new RTCSessionDescription(message));
          this.pc.createAnswer()
            .then(this.setDescription)
            .then(this.sendDescription)
            .catch(this.handleError); // An error occurred, so handle the failure to connect

      } else if (message.type === 'answer') {
          // set remote description
          this.pc.setRemoteDescription(new RTCSessionDescription(message));
      } else if (message.type === 'candidate') {
          // add ice candidate
          this.pc.addIceCandidate(
              new RTCIceCandidate({
                  sdpMLineIndex: message.mlineindex,
                  candidate: message.candidate
              })
          );
      }
  }
  sendData(msg) {
    this.dc.send(JSON.stringify(msg))
  }
  // Set up the data channel message handler
  setupDataHandlers() {
      this.dc.onmessage = e => {
          var msg = JSON.parse(e.data);
          console.log('received message over data channel:' + msg);
      };
      this.dc.onclose = () => {
          this.remoteStream.getVideoTracks()[0].stop();
          console.log('The Data Channel is Closed');
      };
  }
  setDescription = offer => {this.pc.setLocalDescription(offer);console.log('offer', offer)}
  // send the offer to a server to be forwarded to the other peer
  sendDescription = () => this.props.socket.send(this.pc.localDescription)
  handleError = e => console.log(e)
  init(role) {
    // wait for local media to be ready
    const attachMediaIfReady = () => {
      this.dc = this.pc.createDataChannel('chat');
      this.setupDataHandlers();
      console.log('attachMediaIfReady')
      this.pc.createOffer()
        .then(this.setDescription)
        .then(this.sendDescription)
        .catch(this.handleError); // An error occurred, so handle the failure to connect
    }
    // set up the peer connection
    // this is one of Google's public STUN servers
    // make sure your offer/answer role does not change. If user A does a SLD
    // with type=offer initially, it must do that during  the whole session
    this.pc = new RTCPeerConnection({iceServers: [{url: 'stun:stun.l.google.com:19302'}]});
    // when our browser gets a candidate, send it to the peer
    this.pc.onicecandidate = e => {
        console.log(e, 'onicecandidate');
        if (e.candidate) {
            this.props.socket.send({
                type: 'candidate',
                mlineindex: e.candidate.sdpMLineIndex,
                candidate: e.candidate.candidate
            });
        }
    };
    // when the other side added a media stream, show it on screen
    this.pc.onaddstream = e => {
        console.log('onaddstream', e) 
        this.remoteStream = e.stream;
        this.refs.remoteVideo.src = window.URL.createObjectURL(this.remoteStream);
        this.setState({bridge: 'established'});
    };
    this.pc.ondatachannel = e => {
        // data channel
        this.dc = e.channel;
        this.setupDataHandlers();
        this.sendData({
          peerMediaStream: {
            video: this.localStream.getVideoTracks()[0].enabled
          }
        });
        //sendData('hello');
    };
    // attach local media to the peer connection
    this.pc.addStream(this.localStream);
    // call if we were the last to connect (to increase
    // chances that everything is set up properly at both ends)
  console.log('approve', role, this.props.getUserMedia)
    if (role === 'host') {
      this.props.getUserMedia.then(attachMediaIfReady);
    }  
  }
  handleHangup = () => this.componentWillUnmount()
  render(){
    return (
      <div className={`media-bridge ${this.state.bridge}`}>
        <video className="remote-video" ref="remoteVideo" autoPlay></video>
        <video className="local-video" ref="localVideo" autoPlay muted></video>
      </div>
    );
  }
}