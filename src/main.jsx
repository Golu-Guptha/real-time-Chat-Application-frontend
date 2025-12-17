import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { AuthProvider } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { AppDataProvider } from './context/AppDataContext';

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <AuthProvider>
            <SocketProvider>
                <AppDataProvider>
                    <App />
                </AppDataProvider>
            </SocketProvider>
        </AuthProvider>
    </React.StrictMode>,
)
