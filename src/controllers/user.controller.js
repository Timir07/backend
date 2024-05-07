import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
       
//await -> database dusre continent maine hai
const generateAccessAndRefreshTokens = async(userId) => {
    try {
        const user = await User.findById(userId); //this is one instance of db 
        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();

        user.refreshToken = refreshToken; //now refreshToken is saved for this instance in db.
        await user.save({ validationBeforeSave: false });//false as we only want refreshToken to get saved not password

        return {accessToken, refreshToken};
    } catch (error) {
        throw new ApiError(500, "Something went wrong while generationg access and refresh token")
    }
};

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

const loginUser = asyncHandler( async(req, res) => {
    //req body -> data
    const {email, userName, password} = req.body;
    //username or email
    if(!userName && !email){
        throw new ApiError(400, "username or email is required");
    }
    //find user
    const user = await User.findOne({   //here refreshToken field is empty
        $or: [{userName}, {email}]
    })

    if(!user){
        throw new ApiError(404, "User doesn't exists!")
    }
    //password check
    const isPasswordValid = await user.isPasswordCorrect(password);
    
    if(!isPasswordValid){
        throw new ApiError(401, "Password incorrect")
    }
    //access and refresh token
    const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(user._id);
    const loggedInUser = await User.findById(user._id).select("-password -refreshToken");// additional query as refreshToken is added
    //send cookie
    const options = {
        httpOnly: true,
        secure: true,
    }

    return res.status(200)
    .cookie("accessToken", accessToken, options)    //key, value, options
    .cookie("refreshToken", refreshToken, options)
    .json(
        new ApiResponse(
            200,
            {
                user: loggedInUser, accessToken, refreshToken,
            },
            "User logged In Successfully"
        )
    )
});

const logoutUser = asyncHandler( async(req, res) => {
    await User.findByIdAndUpdate(//refreshToken removal from db for logout
        req.user._id, //from middleware jwtverify we get this
        {
            $set: {
                refreshToken: undefined,
            }
        },
        {
            new: true //return updated version of db after the query, here set operation
        }
    )
    const options = {
        httpOnly: true,
        secure: true,
    }

    return res.status(200) //clearing cookies from user sides
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(
        new ApiResponse(
            200,
            {},
            "User logged out"
        )
    )
});

const refreshAccessToken = asyncHandler(async (req, res) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken//if user logged in get refreshToken from cookies
                                                                                 //as access token short lived so expired already
    if (!incomingRefreshToken) {
        throw new ApiError(401, "unauthorized request")
    }

    try {
        const decodedToken = jwt.verify( //token decoded
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
        )
    
        const user = await User.findById(decodedToken?._id)//got _id from decoded token
    
        if (!user) {
            throw new ApiError(401, "Invalid refresh token")
        }
    
        if (incomingRefreshToken !== user?.refreshToken) { //got refreshToken saved in db from user and !compared to refresh token from cookie
            throw new ApiError(401, "Refresh token is expired or used")
            
        }
    
        const options = {
            httpOnly: true,
            secure: true
        }
    
        const {accessToken, newRefreshToken} = await generateAccessAndRefereshTokens(user._id)
    
        return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", newRefreshToken, options)
        .json(
            new ApiResponse(
                200, 
                {accessToken, refreshToken: newRefreshToken},
                "Access token refreshed"
            )
        )
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid refresh token")
    }

});

export { registerUser, loginUser, logoutUser, refreshAccessToken }
