import { useState, useEffect, useContext, useRef } from 'react';
import { AuthContext } from '../context/AuthContext';
import { SocketContext } from '../context/SocketContext';
import axios from 'axios';
import { toast } from 'react-toastify';

const Chat = () => {
  const { user, logout } = useContext(AuthContext);
  const { socket } = useContext(SocketContext);

  const [channels, setChannels] = useState([]);
  const [currentChannel, setCurrentChannel] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelDesc, setNewChannelDesc] = useState('');
  const [onlineUsers, setOnlineUsers] = useState(new Set());

  const messagesEndRef = useRef(null);

  // Fetch channels on mount
  useEffect(() => {
    fetchChannels();
  }, []);

  // Listen for socket events
  useEffect(() => {
    if (!socket) return;

    socket.on('receive_message', (message) => {
      if (currentChannel && message.channel === currentChannel._id) {
        setMessages((prev) => [...prev, message]);
        scrollToBottom();
      }
    });

    socket.on('user_status_change', ({ userId, isOnline }) => {
      setOnlineUsers(prev => {
        const newSet = new Set(prev);
        if (isOnline) {
          newSet.add(userId);
        } else {
          newSet.delete(userId);
        }
        return newSet;
      });

      // Also update channel members status if visible
      setChannels(prevChannels => prevChannels.map(ch => {
        const updatedMembers = ch.members.map(m => {
          if (m._id === userId) {
            return { ...m, isOnline };
          }
          return m;
        });
        return { ...ch, members: updatedMembers };
      }));
    });

    socket.on('message_deleted', (messageId) => {
      setMessages((prev) => prev.map(msg => {
        if (msg._id === messageId) {
          return { ...msg, content: 'This message was deleted', isDeleted: true };
        }
        return msg;
      }));
    });

    return () => {
      socket.off('receive_message');
      socket.off('user_status_change');
      socket.off('message_deleted');
    };
  }, [socket, currentChannel]);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchChannels = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get('http://localhost:5000/api/channels', {
        headers: { 'x-auth-token': token }
      });
      setChannels(res.data);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load channels');
    }
  };

  const fetchMessages = async (channelId) => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`http://localhost:5000/api/messages/${channelId}`, {
        headers: { 'x-auth-token': token }
      });
      setMessages(res.data);
      scrollToBottom();
    } catch (err) {
      console.error(err);
      toast.error('Failed to load messages');
    }
  };

  const handleChannelSelect = async (channel) => {
    const isMember = channel.members.some(member => member._id === user.id || member === user.id);

    if (!isMember) {
      try {
        const token = localStorage.getItem('token');
        await axios.post(`http://localhost:5000/api/channels/${channel._id}/join`, {}, {
          headers: { 'x-auth-token': token }
        });
        fetchChannels();
      } catch (err) {
        console.error(err);
        toast.error('Failed to join channel');
        return;
      }
    }

    setCurrentChannel(channel);
    fetchMessages(channel._id);

    if (socket) {
      socket.emit('join_channel', channel._id);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !currentChannel) return;

    try {
      const token = localStorage.getItem('token');
      const res = await axios.post('http://localhost:5000/api/messages', {
        channelId: currentChannel._id,
        content: newMessage
      }, {
        headers: { 'x-auth-token': token }
      });

      if (socket) {
        socket.emit('send_message', res.data);
      }

      setNewMessage('');
    } catch (err) {
      console.error(err);
      toast.error('Failed to send message');
    }
  };

  const handleDeleteMessage = async (messageId) => {
    if (!window.confirm('Are you sure you want to delete this message?')) return;

    try {
      const token = localStorage.getItem('token');
      const res = await axios.delete(`http://localhost:5000/api/messages/${messageId}`, {
        headers: { 'x-auth-token': token }
      });

      // Optimistic update
      setMessages((prev) => prev.map(msg => {
        if (msg._id === messageId) {
          return { ...msg, content: 'This message was deleted', isDeleted: true };
        }
        return msg;
      }));

      if (socket) {
        socket.emit('delete_message', res.data);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete message');
    }
  };

  const handleCreateChannel = async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post('http://localhost:5000/api/channels', {
        name: newChannelName,
        description: newChannelDesc
      }, {
        headers: { 'x-auth-token': token }
      });

      setChannels([...channels, res.data]);
      setShowCreateChannel(false);
      setNewChannelName('');
      setNewChannelDesc('');
      toast.success('Channel created');
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Failed to create channel');
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="chat-container">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-header">
          <h3>Channels</h3>
          <button onClick={() => setShowCreateChannel(true)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.2rem' }}>+</button>
        </div>
        <div className="channel-list">
          {channels.map(channel => (
            <div
              key={channel._id}
              className={`channel-item ${currentChannel?._id === channel._id ? 'active' : ''}`}
              onClick={() => handleChannelSelect(channel)}
            >
              <span className="hash">#</span>
              {channel.name}
            </div>
          ))}
        </div>
        <div className="user-info">
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div className="online-indicator"></div>
            <span style={{ marginLeft: '0.5rem' }}>{user?.username}</span>
          </div>
          <button onClick={logout} className="logout-btn">Logout</button>
        </div>
      </div>

      {/* Chat Area */}
      <div className="chat-area">
        {currentChannel ? (
          <>
            <div className="chat-header">
              <h3>#{currentChannel.name}</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '0.8rem', color: '#a1a1a1' }}>{currentChannel.description}</span>
                <div style={{ fontSize: '0.8rem', color: '#a1a1a1' }}>
                  {currentChannel.members.length} members
                </div>
              </div>
            </div>
            <div className="messages-list">
              {messages.map((msg, index) => (
                <div
                  key={index}
                  className={`message ${msg.sender._id === user.id ? 'sent' : 'received'}`}
                >
                  <div className="message-sender">{msg.sender.username}</div>
                  <div className={`message-content ${msg.isDeleted ? 'deleted' : ''}`}>
                    {msg.content}
                    {!msg.isDeleted && msg.sender._id === user.id && (
                      <button
                        onClick={() => handleDeleteMessage(msg._id)}
                        className="delete-btn"
                        title="Delete message"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
            <div className="message-input-container">
              <form onSubmit={handleSendMessage} className="message-input-form">
                <input
                  type="text"
                  className="message-input"
                  placeholder={`Message #${currentChannel.name}`}
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                />
                <button type="submit" className="send-btn">Send</button>
              </form>
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#a1a1a1' }}>
            Select a channel to start messaging
          </div>
        )}
      </div>

      {/* Create Channel Modal */}
      {showCreateChannel && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>Create Channel</h3>
              <button onClick={() => setShowCreateChannel(false)} className="close-btn">&times;</button>
            </div>
            <form onSubmit={handleCreateChannel}>
              <div className="form-group">
                <label>Channel Name</label>
                <input
                  type="text"
                  value={newChannelName}
                  onChange={(e) => setNewChannelName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label>Description</label>
                <input
                  type="text"
                  value={newChannelDesc}
                  onChange={(e) => setNewChannelDesc(e.target.value)}
                />
              </div>
              <button type="submit" className="btn-primary">Create</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Chat;
