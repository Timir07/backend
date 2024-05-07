import { Router } from "express";
import { loginUser, logoutUser, refreshAccessToken, registerUser } from "../controllers/user.controller.js";
import { upload } from "../middlewares/multer.middleware.js";
import { jwtVerify } from "../middlewares/auth.middleware.js";

const router = Router();
router.route("/register").post(
    //injecting middleware for file uploads
    upload.fields([
        {
            name: "avatar",
            maxCount: 1
        },
        {
            name: "coverImage",
            maxCount: 1
        }
    ]),
    registerUser);

router.route("/login").post(loginUser);

//secured route - after user logged in
router.route("/logout").post(jwtVerify, logoutUser); //middleware injected
router.route("/refresh-token").post(refreshAccessToken);

export default router;