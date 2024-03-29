import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";

const registerUser = asyncHandler( async(req, res) => {
    //1. get user details from frontend
    const {fullName, email, userName, password} = req.body;
    console.log("email:", email);
    // if(fullName === ""){
    //     throw new ApiError(400, "fullname is required")
    // }

    //2. validation - not empty
    if(
        [fullName, email, userName, password].some((field) =>
        field?.trim() === "")
    ){
        throw new ApiError(400, "All fields are required")
    }

    //3. check if user already exists: username, email // searching
    const existedUser = await User.findOne({
        $or: [{ userName }, { email }]
    })
    console.log("checking of user present in database",existedUser)
    if(existedUser){
        throw new ApiError(409, "User with email or username already exists")
    }

    //4. check for images // using multer here
    const avatarLocalPath = req.files?.avatar[0]?.path //avatar name given in .fields in user.route.js

    let coverImageLocalPath;
    if (req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0) {
        coverImageLocalPath = req.files.coverImage[0].path
    }
    //check for avatar as it is required field
    if(!avatarLocalPath){
        throw new ApiError(400, "Avatar file is required")
    }

    //5.upload them to cloudinary: avatar
    const avatar = await uploadOnCloudinary(avatarLocalPath)
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)
    console.log("Avatar cloudinary path", avatar)
    //check for avatar in cloudinary as it is required field
    if(!avatar){
        throw new ApiError(400, "Avatar file is required")
    }

    //6. create user object - create entry in db
    const user = await User.create({
        fullName,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email,
        password,
        userName: userName.toLowerCase()
    })
    console.log("user details: ", user)
    //7. remove password and refresh token field from response and
    //check for user creation
    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )
    console.log("user detail wihout", createdUser)
    if(!createdUser){
        throw new ApiError(500, "Something went wrong while registering user")
    }

    //8. return response
    return res.status(201).json(
        new ApiResponse(200, createdUser, "User Registered Successfully")
    )
});

export { registerUser }