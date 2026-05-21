// your code here for S2 to display a single user profile after having clicked on it
// each user has their own slug /[id] (/1, /2, /3, ...) and is displayed using this file
// try to leverage the component library from antd by utilizing "Card" to display the individual user
// import { Card } from "antd"; // similar to /app/users/page.tsx

"use client";
// For components that need React hooks and browser APIs,
// SSR (server side rendering) has to be disabled.
// Read more here: https://nextjs.org/docs/pages/building-your-application/rendering/server-side-rendering

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { useUser } from "@/contexts/UserContext";
import { User, Pencil, X, Check, Lock, ArrowLeft } from "lucide-react";
import { useState } from "react";
import { useApi } from "@/hooks/useApi";
import { toFriendlyError } from "@/utils/errors";

const Profile: React.FC = () => {
    const router = useRouter();
    const params = useParams();
    const id = params.id;
    const apiService = useApi();
    const { user, setUser, clearUser } = useUser();

    const firstName = user?.firstName || "";
    const lastName = user?.lastName || "";
    const username = user?.username || "";
    const role = user?.role || "";

    const isOwnProfile = String(id) === String(user?.id);

    // Edit states for each field
    const [editingField, setEditingField] = useState<string | null>(null);
    const [editValues, setEditValues] = useState({
        firstName: "",
        lastName: "",
        username: "",
    });

    // Password change state
    const [showPasswordChange, setShowPasswordChange] = useState(false);
    const [passwordValues, setPasswordValues] = useState({
        oldPassword: "",
        newPassword: "",
    });
    const [error, setError] = useState<string>("");
    const [success, setSuccess] = useState<string>("");

    const startEditing = (field: string, currentValue: string) => {
        setEditingField(field);
        setEditValues({ ...editValues, [field]: currentValue });
        setError("");
        setSuccess("");
    };

    const cancelEditing = () => {
        setEditingField(null);
        setError("");
    };

    const saveField = async (field: string) => {
        try {
            await apiService.put(`/users/${id}`, {
                [field]: editValues[field as keyof typeof editValues],
            }, user?.token ?? undefined);
            setUser({ ...user!, [field]: editValues[field as keyof typeof editValues] });
            setSuccess(`${field} updated successfully!`);
            setEditingField(null);
        } catch (err) {
            if (err instanceof Error) {
                setError(toFriendlyError(err));
            }
        }
    };

    const handlePasswordChange = async () => {
        setError("");
        if (!passwordValues.oldPassword || !passwordValues.newPassword) {
            setError("Both fields are required.");
            return;
        }
        try {
            await apiService.put(`/users/${id}`, {
                oldPassword: passwordValues.oldPassword,
                newPassword: passwordValues.newPassword,
            }, user?.token ?? undefined);
            // Clear user state + localStorage and redirect to login after password change
            clearUser();
            router.push("/login");
        } catch (err) {
            if (err instanceof Error) {
                setError(toFriendlyError(err));
            }
        }
    };

    const renderField = (label: string, field: string, value: string) => {
        const isEditing = editingField === field;
        return (
            <div className="profile-field">
                <label>{label}</label>
                <div className="profile-field-row">
                    {isEditing ? (
                        <>
                            <input
                                className="profile-edit-input"
                                value={editValues[field as keyof typeof editValues]}
                                onChange={(e) =>
                                    setEditValues({ ...editValues, [field]: e.target.value })
                                }
                            />
                            <button className="profile-icon-btn save" onClick={() => saveField(field)}>
                                <Check size={16} />
                            </button>
                            <button className="profile-icon-btn cancel" onClick={cancelEditing}>
                                <X size={16} />
                            </button>
                        </>
                    ) : (
                        <>
                            <span className="profile-field-value">{value || "—"}</span>
                            {isOwnProfile && (
                                <button className="profile-icon-btn edit" onClick={() => startEditing(field, value || "")}>
                                    <Pencil size={14} />
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="login-container">
            <div className="profile-card">
                <button className="profile-back-btn" onClick={() => router.back()}>
                    <ArrowLeft size={14} /> Back
                </button>
                <div className="profile-avatar">
                    <User size={40} />
                </div>
                <h2>{firstName} {lastName}</h2>
                <div className={`role-badge ${role?.toLowerCase()}`}>
                    {role}
                </div>

                <div className="profile-fields">
                    {renderField("First Name", "firstName", firstName)}
                    {renderField("Last Name", "lastName", lastName)}
                    {renderField("Username", "username", username)}
                </div>

                {error && <div className="profile-error">{error}</div>}
                {success && <div className="profile-success">{success}</div>}

                {isOwnProfile && (
                    <div className="profile-password-section">
                        {!showPasswordChange ? (
                            <button
                                className="profile-password-btn"
                                onClick={() => {
                                    setShowPasswordChange(true);
                                    setError("");
                                    setSuccess("");
                                }}
                            >
                                <Lock size={14} /> Change Password
                            </button>
                        ) : (
                            <div className="profile-password-form">
                                <h3>Change Password</h3>
                                <div className="profile-field">
                                    <label>Current Password</label>
                                    <input
                                        className="profile-edit-input"
                                        type="password"
                                        placeholder="Enter current password"
                                        value={passwordValues.oldPassword}
                                        onChange={(e) =>
                                            setPasswordValues({ ...passwordValues, oldPassword: e.target.value })
                                        }
                                    />
                                </div>
                                <div className="profile-field">
                                    <label>New Password</label>
                                    <input
                                        className="profile-edit-input"
                                        type="password"
                                        placeholder="Enter new password"
                                        value={passwordValues.newPassword}
                                        onChange={(e) =>
                                            setPasswordValues({ ...passwordValues, newPassword: e.target.value })
                                        }
                                    />
                                </div>
                                <div className="profile-password-actions">
                                    <button className="profile-save-btn" onClick={handlePasswordChange}>
                                        Save Password
                                    </button>
                                    <button
                                        className="profile-cancel-btn"
                                        onClick={() => {
                                            setShowPasswordChange(false);
                                            setPasswordValues({ oldPassword: "", newPassword: "" });
                                            setError("");
                                        }}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Profile;
