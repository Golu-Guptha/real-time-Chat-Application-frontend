import { createContext, useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { AuthContext } from './AuthContext';
import { SocketContext } from './SocketContext';

export const AppDataContext = createContext();

export const AppDataProvider = ({ children }) => {
    const { user } = useContext(AuthContext);
    const { socket } = useContext(SocketContext);

    const [friends, setFriends] = useState([]);
    const [friendRequests, setFriendRequests] = useState([]);
    const [myChannels, setMyChannels] = useState([]);
    const [loadingData, setLoadingData] = useState(false);

    const fetchData = async () => {
        if (!user) return;
        setLoadingData(true);
        try {
            const token = localStorage.getItem('token');
            const config = { headers: { 'x-auth-token': token } };

            const [friendsRes, requestsRes, channelsRes] = await Promise.all([
                axios.get(`${import.meta.env.VITE_API_URL}/api/users/friends`, config),
                axios.get(`${import.meta.env.VITE_API_URL}/api/users/friend-requests`, config),
                axios.get(`${import.meta.env.VITE_API_URL}/api/channels`, config)
            ]);

            setFriends(friendsRes.data);
            setFriendRequests(requestsRes.data);

            // Filter only joined channels for 'My Channels'
            const allChannels = channelsRes.data;
            const joined = allChannels.filter(c =>
                c.members.some(m => (m._id || m) === (user._id || user.id))
            );
            setMyChannels(joined);

        } catch (err) {
            console.error("Error fetching app data:", err);
        }
        setLoadingData(false);
    };

    useEffect(() => {
        if (user && socket) {
            fetchData();

            socket.on('new_friend_request', () => {
                fetchData();
            });

            // REAL-TIME: User Approved Logic (User Side)
            socket.on('join_request_approved', ({ channel }) => {
                console.log("Received 'join_request_approved' socket event", channel);
                // Optimistically update 'myChannels' so it appears in sidebar instantly
                if (channel) {
                    setMyChannels(prev => {
                        // Avoid duplicates
                        if (prev.find(c => c._id === channel._id)) return prev;
                        return [...prev, channel];
                    });
                    // Join user to the socket room
                    socket.emit('join_channel', channel._id);
                } else {
                    // Fallback to fetch if backend sent incomplete data
                    fetchData();
                }
            });

            socket.on('new_channel', (channel) => {
                console.log("[Frontend] Received 'new_channel' event:", channel);
                setMyChannels(prev => {
                    if (prev.find(c => c._id === channel._id)) {
                        console.log("[Frontend] Channel already in list");
                        return prev;
                    }
                    console.log("[Frontend] Adding new channel to list");
                    return [...prev, channel];
                });
                // Join the socket room immediately
                console.log("[Frontend] Emitting 'join_channel' for:", channel._id);
                socket.emit('join_channel', channel._id);
            });

            // ROBUSTNESS: Listen for messages. If we get a message for a channel we don't have, fetch it.
            socket.on('receive_message', async (message) => {
                // Check if we already have this channel in myChannels
                // Note: We need to access the LATEST 'myChannels' state. 
                // Since this listener is inside useEffect[user, socket], 'myChannels' closure might be stale 
                // IF we relied on the closure variable. BUT we use setMyChannels(prev => ...) for updates, which is fine.
                // However, to CHECK existence, we might check staled data if we just look at 'myChannels'.
                // Strategy: Always try to fetch if we are unsure, OR use functional update to check.
                // Better: Check existence in the setMyChannels callback? 
                // No, we can't do async work inside setMyChannels updater easily (it expects a return value synchronously).

                // Workaround: We will optimistically assume we might need it, or we rely on 'myChannels' ref if we had one.
                // simpler approach: Fetch the channel. If we already have it (by ID), the update logic will filter duplicates.
                // Cost: One extra API call per message? No, that's bad.

                // Let's use a Ref to track channel IDs or just allow the API call for the "First Message" case 
                // (which is rare per channel).
                // Taking a simpler path: 
                // verification is hard without refs.
                // Let's rely on the fact that if we are receiving a message, we MUST be in the socket room.
                // If we are in the socket room, we SHOULD have the channel.
                // The edge case is: "Backend auto-joined us" but "Frontend list is stale/incomplete".

                setMyChannels(prev => {
                    const channelIdStr = String(message.channel);
                    const channelIndex = prev.findIndex(c => String(c._id) === channelIdStr);

                    if (channelIndex > -1) {
                        const updatedChannel = {
                            ...prev[channelIndex],
                            lastMessageAt: new Date().toISOString()
                        };
                        const newChannels = [updatedChannel, ...prev.slice(0, channelIndex), ...prev.slice(channelIndex + 1)];
                        return newChannels;
                    } else {
                        console.log("[Context] Message received for unknown channel, fetching...", message.channel);
                        fetchAndAddChannel(message.channel);
                        return prev;
                    }
                });
            });

            const fetchAndAddChannel = async (channelId) => {
                try {
                    const token = localStorage.getItem('token');
                    const res = await axios.get(`${import.meta.env.VITE_API_URL}/api/channels/${channelId}`, {
                        headers: { 'x-auth-token': token }
                    });
                    const channel = res.data;
                    setMyChannels(prev => {
                        if (prev.find(c => String(c._id) === String(channel._id))) return prev;
                        // Prepend because if we fetched it due to a message/event, it's likely active
                        return [channel, ...prev];
                    });
                } catch (err) {
                    console.error("Failed to fetch missing channel", err);
                }
            };

            return () => {
                socket.off('new_friend_request');
                socket.off('join_request_approved');
                socket.off('new_channel');
                socket.off('receive_message');
            };
        }
    }, [user, socket]);

    const refreshData = () => {
        fetchData();
    };

    return (
        <AppDataContext.Provider value={{
            friends,
            friendRequests,
            myChannels,
            loadingData,
            refreshData,
            setMyChannels
        }}>
            {children}
        </AppDataContext.Provider>
    );
};
