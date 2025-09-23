import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    updateProfile,
    updateEmail,
    sendPasswordResetEmail,
} from "firebase/auth";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, storage } from "../../firebase";
import { useAuth } from "./AuthContext";
import CircleModal from "../imageresize/imageresizeprofile";

const ALLOWED_EXT = /\.(jpe?g|png|webp)$/i;
const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_BYTES = 4 * 1024 * 1024; // 4MB
const ESCALATE_PICKER_ERRORS_TO_TOAST = true; // set false if you don't have a toast

export default function SettingsPage({ onError }) {
    const { user } = useAuth();
    const navigate = useNavigate();

    // Start empty so placeholders (current values) show
    const [nickname, setNickname] = useState("");
    const [email, setEmail] = useState("");
    const [message, setMessage] = useState("");
    const [busy, setBusy] = useState(false);
    const [showMsg, setShowMsg] = useState(false);
    const [showImgErr, setShowImgErr] = useState(false);

    // ----- Avatar cropper state (mirrors RegisterForm) -----
    const [avatarOpen, setAvatarOpen] = useState(false);
    const [pickFile, setPickFile] = useState(null);   // original picked file
    const [avatarFile, setAvatarFile] = useState(null); // cropped blob/file
    const [avatarPrev, setAvatarPrev] = useState("");   // preview URL (blob or remote)
    const [imgError, setImgError] = useState("");

    const fileInputRef = useRef(null);
    const blobUrlRef = useRef(null); // track current blob URL to revoke reliably

    // Keep placeholders accurate on user changes; also reset inputs so placeholder is visible
    useEffect(() => {
        setNickname("");
        setEmail("");
    }, [user?.displayName, user?.email]);

    // Initialize preview from current photoURL (remote) so user can “Edit crop”
    useEffect(() => {
        if (user?.photoURL) {
            setAvatarPrev(user.photoURL); // remote URL; don't revoke
        } else {
            setAvatarPrev("");
        }
    }, [user?.photoURL]);

    // Cleanup: revoke any blob URL we made
    useEffect(() => {
        return () => {
            if (blobUrlRef.current) {
                URL.revokeObjectURL(blobUrlRef.current);
                blobUrlRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        if (message) {
            setShowMsg(true);
            const timer = setTimeout(() => setShowMsg(false), 2500); // fade trigger
            const clearTimer = setTimeout(() => setMessage(""), 3000); // full vanish
            return () => {
                clearTimeout(timer);
                clearTimeout(clearTimer);
            };
        }
    }, [message]);

    // watch imgError
    useEffect(() => {
        if (imgError) {
            setShowImgErr(true);
            const timer = setTimeout(() => setShowImgErr(false), 2500);
            const clearTimer = setTimeout(() => setImgError(""), 3000);
            return () => {
                clearTimeout(timer);
                clearTimeout(clearTimer);
            };
        }
    }, [imgError]);

    // ---------- avatar picker handlers (same behaviour as RegisterForm) ----------
    const onClickPick = () => fileInputRef.current?.click();

    const onChooseFile = (e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (!f) return;

        // Prefer MIME; also require filename extension to be safe
        const mimeOk = f.type ? ALLOWED_TYPES.includes(f.type) : true;
        const extOk = ALLOWED_EXT.test(f.name || "");
        if (!(mimeOk && extOk)) {
            const msg = "Please upload JPEG/JPG, PNG, or WebP.";
            setImgError(msg);
            if (ESCALATE_PICKER_ERRORS_TO_TOAST) onError?.(msg);
            return;
        }
        if (f.size > MAX_BYTES) {
            const mb = (MAX_BYTES / (1024 * 1024)).toFixed(0);
            const msg = `Image is too large (max ${mb} MB).`;
            setImgError(msg);
            if (ESCALATE_PICKER_ERRORS_TO_TOAST) onError?.(msg);
            return;
        }

        setImgError("");
        setPickFile(f);
        setAvatarOpen(true);
    };

    const onCropDone = ({ file }) => {
        setAvatarFile(file);

        // Replace preview with new blob URL; revoke previous blob if any
        if (blobUrlRef.current) {
            URL.revokeObjectURL(blobUrlRef.current);
            blobUrlRef.current = null;
        }
        const url = URL.createObjectURL(file);
        blobUrlRef.current = url;
        setAvatarPrev(url);

        setAvatarOpen(false);
        setMessage("✅ Avatar ready. Click 'Save Avatar' to apply.");
    };

    const resetAvatarLocal = () => {
        // Revoke blob if current preview is a blob
        if (blobUrlRef.current) {
            URL.revokeObjectURL(blobUrlRef.current);
            blobUrlRef.current = null;
        }
        setAvatarPrev(user?.photoURL || ""); // revert to remote image (if any)
        setAvatarFile(null);
        setPickFile(null);
        setImgError("");
    };

    // ---------- avatar upload (with unique path + MIME-correct ext) ----------
    const handleSaveAvatar = async () => {
        if (!user) return;
        if (!avatarFile) {
            const msg = "⚠️ Pick & crop a photo first.";
            setMessage(msg);
            return;
        }
        setBusy(true);
        try {
            const mime = avatarFile.type || "";
            const ext = mime.split("/")[1] || "bin";
            const path = `avatars/${user.uid}/${Date.now()}.${ext}`; // unique path busts caches
            const sref = storageRef(storage, path);

            await uploadBytes(sref, avatarFile, {
                contentType: mime || undefined,
                cacheControl: "public,max-age=31536000,immutable",
            });
            const photoURL = await getDownloadURL(sref);

            await updateProfile(user, { photoURL });
            await auth.currentUser?.reload();

            setMessage("✅ Avatar updated!");
        } catch (err) {
            console.error(err);
            setMessage("❌ Failed to update avatar.");
        } finally {
            setBusy(false);
        }
    };

    // ---------- profile fields ----------
    const handleUpdateNickname = async () => {
        if (!user) return;

        const nextName = nickname.trim() || user.displayName || "";
        if ((user.displayName || "") === nextName) {
            setMessage("No changes to nickname.");
            return;
        }

        setBusy(true);
        try {
            await updateProfile(user, { displayName: nextName });
            await auth.currentUser?.reload();
            setMessage("✅ Nickname updated!");
            setNickname(""); // clear so placeholder shows updated name
        } catch (err) {
            console.error(err);
            setMessage("❌ Failed to update nickname.");
        } finally {
            setBusy(false);
        }
    };

    const handleUpdateEmail = async () => {
        if (!user) return;

        const nextEmail = (email.trim() || user.email || "").toLowerCase();
        if ((user.email || "").toLowerCase() === nextEmail) {
            setMessage("No changes to email.");
            return;
        }

        setBusy(true);
        try {
            await updateEmail(user, nextEmail);
            await auth.currentUser?.reload();
            setMessage("✅ Email updated! You may need to re-login.");
            setEmail(""); // clear so placeholder shows updated email
        } catch (err) {
            console.error(err);
            const code = err?.code;
            if (code === "auth/requires-recent-login") {
                setMessage("⚠️ Please re-login to change your email (security requirement).");
            } else if (code === "auth/email-already-in-use") {
                setMessage("❌ That email is already in use.");
            } else if (code === "auth/invalid-email") {
                setMessage("❌ Please enter a valid email address.");
            } else {
                setMessage("❌ Failed to update email.");
            }
        } finally {
            setBusy(false);
        }
    };

    const handlePasswordReset = async () => {
        const target = (email || user?.email || "").trim();
        if (!target) {
            setMessage("⚠️ Enter an email first.");
            return;
        }
        setBusy(true);
        try {
            await sendPasswordResetEmail(auth, target);
            setMessage(`📧 Password reset email sent to ${target}!`);
        } catch (err) {
            console.error(err);
            setMessage("❌ Failed to send reset email.");
        } finally {
            setBusy(false);
        }
    };

    if (!user) {
        // Optional: redirect unauthenticated users
        navigate("/login");
        return null;
    }

    // Computed: disable save buttons if no actual changes typed
    const hasNicknameChange =
        (nickname.trim() || "") !== "" &&
        (nickname.trim() !== (user.displayName || ""));

    const hasEmailChange =
        (email.trim() || "") !== "" &&
        (email.trim().toLowerCase() !== (user.email || "").toLowerCase());

    return (
        <div className="container py-4">
            <h2 className="mb-4">Settings</h2>

            {message && (
                <div className={`alert alert-info fade ${showMsg ? "show" : ""}`} role="alert">
                    {message}
                </div>
            )}
            {imgError && (
                <div className={`alert alert-warning fade ${showImgErr ? "show" : ""}`} role="alert">
                    {imgError}
                </div>
            )}

            {/* Avatar */}
            <div className="mb-4">
                <label className="form-label">Avatar</label>
                <div className="d-flex align-items-center gap-3 flex-wrap">
                    <div
                        className="rounded-circle overflow-hidden border"
                        style={{ width: 160, height: 160, background: "#f8f9fa" }}
                    >
                        {avatarPrev ? (
                            <img
                                src={avatarPrev}
                                alt="avatar"
                                width="160"
                                height="160"
                                style={{ objectFit: "cover", display: "block" }}
                            />
                        ) : (
                            <div className="w-100 h-100 d-flex align-items-center justify-content-center text-secondary">
                                160×160
                            </div>
                        )}
                    </div>

                    <div className="d-flex flex-column gap-2">
                        <div className="d-flex gap-2">
                            <button type="button" className="btn btn-outline-primary" onClick={onClickPick}>
                                Choose photo
                            </button>
                            <button
                                type="button"
                                className="btn btn-outline-secondary"
                                onClick={() => (pickFile || avatarFile) ? setAvatarOpen(true) : onClickPick()}
                                disabled={!pickFile && !avatarFile}
                            >
                                {avatarPrev ? "Edit crop" : "Crop photo"}
                            </button>
                            {avatarPrev && (
                                <button type="button" className="btn btn-outline-danger" onClick={resetAvatarLocal}>
                                    Remove
                                </button>
                            )}
                        </div>

                        <button
                            type="button"
                            className="btn btn-success"
                            onClick={handleSaveAvatar}
                            disabled={busy || !avatarFile}
                            title={!avatarFile ? "Pick & crop a photo first" : "Upload and save"}
                            aria-busy={busy ? "true" : "false"}
                        >
                            {busy ? "Saving..." : "Save Avatar"}
                        </button>
                    </div>
                </div>

                {/* Hidden file input */}
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="d-none"
                    onChange={onChooseFile}
                />
            </div>

            {/* Nickname */}
            <div className="mb-3">
                <label className="form-label">Nickname</label>
                <input
                    type="text"
                    className="form-control"
                    value={nickname}
                    placeholder={user?.displayName || "Your nickname"}
                    onChange={(e) => setNickname(e.target.value)}
                />
                <button
                    className="btn btn-primary mt-2"
                    onClick={handleUpdateNickname}
                    disabled={busy || !hasNicknameChange}
                    aria-busy={busy ? "true" : "false"}
                    title={!hasNicknameChange ? "Type a new nickname to enable" : "Save nickname"}
                >
                    Save Nickname
                </button>
            </div>

            {/* Email */}
            <div className="mb-3">
                <label className="form-label">Email</label>
                <input
                    type="email"
                    className="form-control"
                    value={email}
                    placeholder={user?.email || "you@example.com"}
                    onChange={(e) => setEmail(e.target.value)}
                />
                <button
                    className="btn btn-primary mt-2"
                    onClick={handleUpdateEmail}
                    disabled={busy || !hasEmailChange}
                    aria-busy={busy ? "true" : "false"}
                    title={!hasEmailChange ? "Type a different email to enable" : "Save email"}
                >
                    Save Email
                </button>
            </div>

            {/* Password reset */}
            <div className="mb-4">
                <button
                    className="btn btn-outline-secondary"
                    onClick={handlePasswordReset}
                    disabled={busy}
                    aria-busy={busy ? "true" : "false"}
                >
                    Send Password Reset Email
                </button>
            </div>

            <button className="btn btn-outline-dark" onClick={() => navigate("/profile")}>
                Back to Profile
            </button>

            {/* Avatar cropper modal */}
            {avatarOpen && (
                <CircleModal
                    open={avatarOpen}
                    onClose={() => setAvatarOpen(false)}
                    file={pickFile}          // preferred if present
                    imageURL={avatarPrev}    // reopen using current preview (remote or cropped)
                    onExport={onCropDone}    // gets { file }
                />
            )}
        </div>
    );
}
