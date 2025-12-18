import { useState, useEffect, useContext, useRef } from 'react';
import { AuthContext } from '../context/AuthContext';
import { SocketContext } from '../context/SocketContext';
import { AppDataContext } from '../context/AppDataContext';
import CreateChannelModal from '../components/CreateChannelModal';
import SearchPanel from '../components/SearchPanel';
import FriendRequestsModal from '../components/FriendRequestsModal';
import ChannelInfoModal from '../components/ChannelInfoModal';
import JoinRequestsModal from '../components/JoinRequestsModal';
import axios from 'axios';
import { toast } from 'react-toastify';

const Chat = () => {
  const { user, logout } = useContext(AuthContext);
  const { socket } = useContext(SocketContext);
  const { myChannels, setMyChannels, refreshData, friendRequests } = useContext(AppDataContext);

  // Robustly determine current user ID (handles login vs reload differences)
  const currentUserId = user?._id || user?.id;

  const [currentChannel, setCurrentChannel] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [file, setFile] = useState(null);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showFriendRequests, setShowFriendRequests] = useState(false);
  const [showChannelInfo, setShowChannelInfo] = useState(false);
  const [showJoinRequests, setShowJoinRequests] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const [unreadCounts, setUnreadCounts] = useState({});
  const [mobileView, setMobileView] = useState('channels'); // 'channels', 'chat', 'members'

  const messagesEndRef = useRef(null);

  // No need to fetch channels on mount here, AppDataContext handles it
  // But we might want to select the first channel or restore previous selection
  useEffect(() => {
    // Sync currentChannel with updated myChannels to ensure Admin modal has fresh data
    // BUT be careful not to overwrite POPULATED joinRequests with UNPOPULATED IDs from myChannels
    if (currentChannel && myChannels && myChannels.length > 0) {
      const updatedChannel = myChannels.find(c => c._id === currentChannel._id);

      if (updatedChannel) {
        // Use try-catch to prevent any crash from crashing the whole app
        try {
          // If the cached update only has IDs but we have Objects, keep our Objects!
          // This happens because 'getChannels' (AppDataContext) doesn't populate joinRequests, 
          // while 'getChannelDetails' (Chat select) does.

          const hasRichRequests = currentChannel.joinRequests &&
            currentChannel.joinRequests.length > 0 &&
            typeof currentChannel.joinRequests[0] === 'object';
          const incomingHasRichRequests = updatedChannel.joinRequests &&
            updatedChannel.joinRequests.length > 0 &&
            typeof updatedChannel.joinRequests[0] === 'object';

          if (hasRichRequests && !incomingHasRichRequests) {
            // Merge everything EXCEPT joinRequests
            setCurrentChannel(prev => {
              if (!prev) return updatedChannel;
              return {
                ...updatedChannel,
                joinRequests: prev.joinRequests || []
              };
            });
          } else {
            // Should be safe to update fully? 
            // Actually, if we are Admin, we prefer the 'refreshed' detail view usually.
            // But let's avoid overriding if we suspect it's just a general list update.
            // Better logic: Only update if we really need to (e.g. name changed, members changed).
            // For now, PRESERVING joinRequests is key.
            setCurrentChannel(prev => {
              if (!prev) return updatedChannel;
              return {
                ...updatedChannel,
                joinRequests: prev.joinRequests || [] // Always prioritize the Local/Detailed requests unless we explicitly refetch details
              };
            });
          }
        } catch (err) {
          console.error('Error syncing currentChannel:', err);
          // Fallback: just keep current state
        }
      }
    }
  }, [myChannels]);

  // Re-fetch channel details when app data refreshes (signal that something changed)
  // Or, we can expose a function to 'reloadCurrentChannel' and pass it to modal.
  const refreshCurrentChannel = async () => {
    if (!currentChannel) return;
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${import.meta.env.VITE_API_URL}/api/channels/${currentChannel._id}`, {
        headers: { 'x-auth-token': token }
      });
      setCurrentChannel(res.data);
    } catch (err) { console.error(err); }
  };

  // Pure local update helper for join requests
  const handleRequestProcessed = (userId) => {
    setCurrentChannel(prev => {
      if (!prev) return prev;
      // Local removal of the request to update UI immediately
      const updatedRequests = prev.joinRequests ? prev.joinRequests.filter(r => (typeof r === 'object' ? r._id : r) !== userId) : [];
      return {
        ...prev,
        joinRequests: updatedRequests
      };
    });
  };

  // Listen for socket events
  useEffect(() => {
    if (!socket) return;

    socket.on('receive_message', (message) => {
      if (currentChannel && message.channel === currentChannel._id) {
        setMessages((prev) => [...prev, message]);
        scrollToBottom();
      } else {
        // Increment unread count if not current channel
        setUnreadCounts(prev => ({
          ...prev,
          [message.channel]: (prev[message.channel] || 0) + 1
        }));

        // Popup Notification
        // Find channel name
        const channelName = myChannels.find(c => String(c._id) === String(message.channel))?.name || 'Unknown';
        // Notify if not current user
        if (message.sender._id !== currentUserId) {
          toast.info(`New message in #${channelName} from ${message.sender.username}`, {
            position: "top-right",
            autoClose: 3000,
            hideProgressBar: false,
            closeOnClick: true,
            pauseOnHover: true,
            draggable: true,
          });
        }
      }

      // Real-time: Move channel to top
      setMyChannels(prev => {
        const moveId = String(message.channel);
        const idx = prev.findIndex(c => String(c._id) === moveId);
        if (idx > -1) {
          const updated = { ...prev[idx], lastMessageAt: new Date().toISOString() };
          return [updated, ...prev.filter((_, i) => i !== idx)];
        }
        return prev;
      });
    });

    socket.on('user_joined', ({ channelId, user: joinedUser }) => {
      // If we are currently viewing this channel, add the user to the list
      if (currentChannel && channelId === currentChannel._id) {
        setCurrentChannel(prev => {
          if (prev.members.find(m => m._id === joinedUser._id)) return prev;
          return {
            ...prev,
            members: [...prev.members, joinedUser]
          };
        });
        setOnlineUsers(prev => new Set(prev).add(joinedUser._id));
      }
      // If WE are the joined user (e.g. approved via socket elsewhere?), we might want to refresh? 
      // Handled by AppDataContext 'join_request_approved' event.
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
    });

    // Real-time update for Message Deletion
    socket.on('message_deleted', (payload) => {
      setMessages((prev) => prev.map(msg => {
        // Handle if payload is just ID or full object
        const msgId = typeof payload === 'object' ? payload._id : payload;

        if (msg._id === msgId) {
          // If payload has content (it's an object), use it. Else fallback.
          const newContent = typeof payload === 'object' && payload.content
            ? payload.content
            : 'This message was deleted';

          // CRITICAL: Prevent overwriting "Admin has deleted..." with generic text 
          // (which happens if server sends legacy socket event)
          if (msg.content === 'Admin has deleted that message' && newContent === 'This message was deleted') {
            return msg;
          }

          return { ...msg, content: newContent, isDeleted: true };
        }
        return msg;
      }));
    });

    // Real-time update for ADMIN: New Join Request
    socket.on('new_join_request', ({ channelId, user }) => {
      console.log('DEBUG: Socket event received', { channelId, user });
      // DEBUG TOAST - Remove later
      toast.info(`Debug: Req received for ${channelId} from ${user?.username}`);

      // If we are looking at this channel, update state
      setCurrentChannel(prev => {
        console.log('DEBUG: Checking match', prev?._id, channelId);
        if (prev && String(prev._id) === String(channelId)) {
          // Check if already in requests
          const exists = prev.joinRequests && prev.joinRequests.find(r => (r._id || r) === user._id);
          if (exists) return prev;

          return {
            ...prev,
            joinRequests: [...(prev.joinRequests || []), user]
          };
        }
        return prev;
      });
    });

    return () => {
      socket.off('receive_message');
      socket.off('user_joined');
      socket.off('user_status_change');
      socket.off('new_join_request');
      socket.off('message_deleted');
    };
  }, [socket, currentChannel]);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // fetchChannels removed, using AppDataContext.

  // Helper to join from Search
  const handleJoinChannel = async (channel) => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(`${import.meta.env.VITE_API_URL}/api/channels/${channel._id}/join`, {}, {
        headers: { 'x-auth-token': token }
      });

      if (res.data.status === 'pending') {
        toast.info('Join request sent to admin');
      } else {
        toast.success('Joined channel');
        refreshData(); // Refresh context
        handleChannelSelect(res.data.channel || channel); // Select it
      }
      setShowSearch(false);
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Failed to join');
    }
  };

  const fetchMessages = async (channelId) => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${import.meta.env.VITE_API_URL}/api/messages/${channelId}`, {
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
    // Clear unread count
    setUnreadCounts(prev => ({ ...prev, [channel._id]: 0 }));

    const isMember = channel.members.some(member => member._id === currentUserId || member === currentUserId);

    if (!isMember) {
      try {
        // Only valid if we are implementing joining on click (which we are not really doing for sidebar items as they are 'myChannels')
        // But if we did:
        setCurrentChannel(channel);
        fetchMessages(channel._id);
      } catch (err) {
        console.error(err);
        toast.error('Failed to join channel');
        return;
      }
    }

    // Improve: Fetch full channel details (to get populated joinRequests for Admin)
    try {
      // Optimistic set
      setCurrentChannel(channel);

      const token = localStorage.getItem('token');
      const res = await axios.get(`${import.meta.env.VITE_API_URL}/api/channels/${channel._id}`, {
        headers: { 'x-auth-token': token }
      });
      setCurrentChannel(res.data); // Update with fully populated data
    } catch (err) {
      console.error("Failed to fetch channel details", err);
      // Fallback is already set
    }

    fetchMessages(channel._id);

    if (socket) {
      socket.emit('join_channel', channel._id);
    }

    // Switch to chat view on mobile
    setMobileView('chat');
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if ((!newMessage.trim() && !file) || !currentChannel) return;

    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('channelId', currentChannel._id);
      formData.append('content', newMessage);
      if (file) {
        formData.append('file', file);
      }

      const res = await axios.post(`${import.meta.env.VITE_API_URL}/api/messages`, formData, {
        headers: {
          'x-auth-token': token,
          'Content-Type': 'multipart/form-data'
        }
      });

      if (socket) {
        socket.emit('send_message', res.data);
      }

      setNewMessage('');
      setFile(null); // Reset file
    } catch (err) {
      console.error(err);
      toast.error('Failed to send message');
    }
  };

  const handleDeleteMessage = async (messageId) => {
    if (!window.confirm('Are you sure you want to delete this message?')) return;

    try {
      const token = localStorage.getItem('token');
      const res = await axios.delete(`${import.meta.env.VITE_API_URL}/api/messages/${messageId}`, {
        headers: { 'x-auth-token': token }
      });

      // Update using the response from server (which has correct admin text)
      setMessages((prev) => prev.map(msg => {
        if (msg._id === messageId) {
          return { ...msg, content: res.data.content, isDeleted: true, deletedBy: res.data.deletedBy };
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



  const handleCreateChannel = async (channelData) => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(`${import.meta.env.VITE_API_URL}/api/channels`, channelData, {
        headers: { 'x-auth-token': token }
      });

      setMyChannels(prev => [res.data, ...prev]);
      setShowCreateChannel(false);
      refreshData();
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
    <div className={`chat-container mobile-view-${mobileView}`}>
      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-header">
          <h3>Channels</h3>
          <div className="sidebar-actions">
            <button onClick={() => setShowSearch(true)} title="Search">🔍</button>
            <button onClick={() => setShowFriendRequests(true)} title="Friend Requests" style={{ position: 'relative' }}>
              🔔
              {friendRequests.length > 0 && <span className="notification-badge">{friendRequests.length}</span>}
            </button>
          </div>
        </div>
        <div style={{ padding: '0 15px 10px 15px' }}>
          <button
            onClick={() => setShowCreateChannel(true)}
            className="create-channel-btn"
            style={{
              fontSize: '0.9rem',
              width: '100%',
              padding: '8px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '4px',
              color: '#d1d5db',
              cursor: 'pointer'
            }}
          >
            <span>Want to create a channel?</span>
            <span>+</span>
          </button>
        </div>
        <div className="channel-list">
          {myChannels.map(channel => {
            // Helper to get display name for DM
            let displayName = channel.name;
            let isDM = channel.isDirectMessage;
            if (isDM && channel.members) {
              const otherMember = channel.members.find(m => m._id !== currentUserId && m !== currentUserId);
              // If members are strings, we can't get name. But we populated them in backend.
              if (otherMember && typeof otherMember === 'object') {
                displayName = otherMember.username;
              } else if (!otherMember) {
                // Self DM? or data issue.
                displayName = 'Direct Message';
              }
            }

            return (
              <div
                key={channel._id}
                className={`channel-item ${currentChannel?._id === channel._id ? 'active' : ''}`}
                onClick={() => handleChannelSelect(channel)}
              >
                <span className="hash">{isDM ? '@' : '#'}</span>
                {displayName}
                {channel.isPrivate && !isDM && <span className="lock-icon">🔒</span>}
                {unreadCounts[channel._id] > 0 && (
                  <span className="notification-badge" style={{ position: 'static', marginLeft: 'auto', background: '#ef4444' }}>
                    {unreadCounts[channel._id]}
                  </span>
                )}
                {/* Show online count or badges if needed */}
              </div>
            )
          })}
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
            {/* Clickable Header for Info */}
            <div className="chat-header" onClick={() => setShowChannelInfo(true)} style={{ cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button
                    className="mobile-back-btn"
                    onClick={(e) => { e.stopPropagation(); setMobileView('channels'); }}
                    style={{ fontSize: '1.2rem', background: 'none', border: 'none', color: 'white', cursor: 'pointer', display: 'none' }}
                  >
                    ←
                  </button>
                  <h3>#{currentChannel.name}</h3>
                </div>
                <span className="info-icon" style={{ fontSize: '1.2rem' }}>ℹ️</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '0.8rem', color: '#a1a1a1' }}>{currentChannel.description}</span>
                <div style={{ fontSize: '0.8rem', color: '#a1a1a1' }}>
                  {/* Show simple member count here */}
                  {currentChannel.members.length} members
                </div>
              </div>
            </div>
            <div className="messages-list">
              {messages.map((msg, index) => {
                const isMyMessage = msg.sender._id === currentUserId;
                console.log('Debug Message:', { msgId: msg._id, senderId: msg.sender._id, currentUserId, isMyMessage });
                return (
                  <div
                    key={index}
                    className={`message ${isMyMessage ? 'sent' : 'received'}`}
                  >
                    <div className="message-sender">{msg.sender.username}</div>
                    <div className={`message-content ${msg.isDeleted ? 'deleted' : ''}`}>
                      {msg.fileUrl && (
                        <div className="message-file">
                          {msg.fileType === 'image' ? (
                            <img src={`${import.meta.env.VITE_API_URL}${msg.fileUrl}`} alt="attachment" style={{ maxWidth: '200px', borderRadius: '8px' }} />
                          ) : (
                            <a href={`${import.meta.env.VITE_API_URL}${msg.fileUrl}`} target="_blank" rel="noopener noreferrer">📎 Download File</a>
                          )}
                        </div>
                      )}
                      {msg.content}
                      {!msg.isDeleted && (isMyMessage || (currentChannel.admin?._id === currentUserId || currentChannel.admin === currentUserId)) && (
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
                );
              })}
              <div ref={messagesEndRef} />
            </div>
            <div className="message-input-container">
              <form onSubmit={handleSendMessage} className="message-input-form">
                <input
                  type="file"
                  id="file-input"
                  style={{ display: 'none' }}
                  onChange={e => setFile(e.target.files[0])}
                />
                <button type="button" onClick={() => document.getElementById('file-input').click()} style={{ marginRight: '10px' }}>
                  {file ? '📄' : '📎'}
                </button>
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
        )
        }
      </div >

      {/* Members Sidebar */}
      {
        currentChannel && (
          <div className="members-sidebar">
            <div className="members-header" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                className="mobile-back-btn"
                onClick={() => setMobileView('chat')}
                style={{ fontSize: '1.2rem', background: 'none', border: 'none', color: 'white', cursor: 'pointer', display: 'none' }}
              >
                ←
              </button>
              <h3>Members — {currentChannel.members.length}</h3>
            </div>
            <div className="members-list">
              {(currentChannel.members || [])
                .filter(member => {
                  if (!member || typeof member !== 'object') return false; // Safety check
                  // Filter: Only show ONLINE users in this sidebar list as requested
                  // Always show SELF
                  const isOnline = onlineUsers.has(member._id) || member.isOnline || member._id === user.id;
                  return isOnline;
                })
                .map(member => {
                  const isOnline = onlineUsers.has(member._id) || member.isOnline || member._id === user.id;
                  return (
                    <div key={member._id} className="member-item">
                      <div className="member-avatar">
                        {(member.username || '?').charAt(0).toUpperCase()}
                        <div className={`member-status ${isOnline ? 'online' : ''}`}></div>
                      </div>
                      <div className="member-name" style={{ color: isOnline ? '#fff' : '' }}>
                        {member.username || 'Unknown'}
                        {(currentChannel.admin?._id === member._id || currentChannel.admin === member._id) && '(Admin)'}
                        {member._id === currentUserId && ' (You)'}
                      </div>
                    </div>
                  );
                })}
            </div>
            {/* Admin Controls */}
            {(currentChannel.admin?._id === currentUserId || currentChannel.admin === currentUserId) && (
              <div style={{ marginTop: '20px', padding: '10px', borderTop: '1px solid #444' }}>
                <h4>Admin Controls</h4>
                {currentChannel.isPrivate && currentChannel.joinRequests?.length > 0 ? (
                  <button
                    onClick={() => setShowJoinRequests(true)}
                    style={{ width: '100%', marginTop: '10px', background: '#e67700', border: 'none', padding: '8px', color: 'white', borderRadius: '4px', cursor: 'pointer' }}
                  >
                    View Requests ({currentChannel.joinRequests.length})
                  </button>
                ) : (
                  currentChannel.isPrivate && <p style={{ fontSize: '0.8rem', color: '#666' }}>No pending requests</p>
                )}
              </div>
            )}
          </div>
        )
      }

      {/* Join Requests Modal */}
      {
        showJoinRequests && currentChannel && (
          <JoinRequestsModal
            channel={currentChannel}
            onClose={() => setShowJoinRequests(false)}
            onChannelUpdate={refreshCurrentChannel}
            onRequestProcessed={handleRequestProcessed}
          />
        )
      }

      {/* Create Channel Modal */}
      {
        showCreateChannel && (
          <CreateChannelModal onClose={() => setShowCreateChannel(false)} onCreate={handleCreateChannel} />
        )
      }

      {/* Search Panel */}
      {
        showSearch && (
          <SearchPanel
            onClose={() => setShowSearch(false)}
            onJoinChannel={handleJoinChannel}
            onChannelSelect={handleChannelSelect}
          />
        )
      }

      {/* Friend Requests Modal */}
      {
        showFriendRequests && (
          <FriendRequestsModal onClose={() => setShowFriendRequests(false)} />
        )
      }

      {/* Channel Info Modal */}
      {
        showChannelInfo && currentChannel && (
          <ChannelInfoModal
            channel={currentChannel}
            onClose={() => setShowChannelInfo(false)}
            onChannelSelect={handleChannelSelect}
            onlineUsers={onlineUsers}
          />
        )
      }
    </div >
  );
};

export default Chat;
