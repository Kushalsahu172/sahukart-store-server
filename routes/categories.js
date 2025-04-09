const { Category } = require('../models/category');
const { ImageUpload } = require('../models/imageUpload');
const express = require('express');
const router = express.Router();
const multer  = require('multer');

const fs = require("fs");

const cloudinary = require('cloudinary').v2;

cloudinary.config({
    cloud_name: process.env.cloudinary_Config_Cloud_Name,
    api_key: process.env.cloudinary_Config_api_key,
    api_secret: process.env.cloudinary_Config_api_secret,
    secure: true
});

var imagesArr=[];

const storage = multer.diskStorage({

    destination: function (req, file, cb) {
      cb(null, "uploads");
    },
    filename: function (req, file, cb) {
      cb(null, `${Date.now()}_${file.originalname}`);
    },
  })

  const upload = multer({ storage: storage })

  router.post(`/upload`, upload.array("images"), async (req, res) => {
    imagesArr=[];
    try{

        for (let i = 0; i < req.files.length; i++) {

            const options = {
                use_filename: true,
                unique_filename: false,
                overwrite: false,
            };

            const img = await cloudinary.uploader.upload(req.files[i].path, options,
                function (error, result) {
                    imagesArr.push(result.secure_url);
                    fs.unlinkSync(`uploads/${req.files[i].filename}`);
                });
        }

        let imagesUploaded = new ImageUpload({
            images: imagesArr,
        });

        imagesUploaded = await imagesUploaded.save();
        return res.status(200).json(imagesArr);

    }catch(error){
        console.log(error);
    }

  });


const createCategories = (categories, parentId=null) => {

    const categoryList = [];
    let category;
    if (parentId == null) {
        category = categories.filter((cat) => cat.parentId == undefined);
    } else {
        category = categories.filter((cat) => cat.parentId == parentId);
    }

    for (let cat of category) {
        categoryList.push({
            _id: cat._id,
            name: cat.name,
            images: cat.images,
            color:cat.color,
            slug:cat.slug,
            children: createCategories(categories, cat._id)
        });
    }

    return categoryList;
};

router.get(`/`, async (req, res) => {
    try {

        const categoryList = await Category.find();

        if (!categoryList) {
            res.status(500).json({ success: false});
        }

        if (categoryList) {
            const categoryData = createCategories(categoryList);

            return res.status(200).json({
                categoryList: categoryData
            });
        }
    } catch (error) {
        res.status(500).json({ success: false});
    }
   
});


router.get(`/get/count`, async(req, res) => {
    const categoryCount = await Category.countDocuments({parentId: undefined});

    if(!categoryCount) {
        res.status(500).json({success: false})
    }
    else{
        res.send({
            categoryCount: categoryCount
        });
    }
});

router.get(`/subCat/get/count`, async(req, res) => {
    const categories = await Category.find();

    if(!categories) {
        res.status(500).json({success: false})
    }
    else{
        const subCatList = [];
        for(let cat of categories) {
            if(cat.parentId!==undefined){
                subCatList.push(cat);
            }
        }

        res.send({
            categoryCount: subCatList.length,
        });
    }
});




router.get(`/:id`, async (req, res)=> {
    categoryEditId=req.params.id;

    const category = await Category.findById(req.params.id);

    if(!category) {
        res.status(500).json({message: 'The category with the given ID was not found.' })
    }
    return res.status(200).send(category);
});




router.post(`/create`, async (req, res) => {
    let catObj = {};
    if (imagesArr.length > 0) {
        catObj = {
            name: req.body.name,
            images: imagesArr,
            color: req.body.color,
            slug: req.body.name,
        };
    }else {
        catObj = {
            name: req.body.name,
            slug: req.body.name,
        };
    }

    if (req.body.parentId) {
        catObj.parentId = req.body.parentId;
    }

    let category = new Category(catObj);

    if (!category) {
        res.status(500).json({
            error: err,
            success: false,
        });
    }

    category = await category.save();

    imagesArr = [];

    res.status(201).json(category);
});

router.delete('/deleteImage', async (req, res) => {
    try {
        const { categoryId, imageId } = req.body; // Ensure imageId is sent

        console.log("Received delete request for:", { categoryId, imageId });

        // Find the category
        const category = await Category.findById(categoryId);
        if (!category) {
            return res.status(404).json({ success: false, message: "Category not found!" });
        }

        // Find the image URL that needs to be deleted
        const imageUrl = category.images.find(img => img.includes(imageId));
        if (!imageUrl) {
            return res.status(404).json({ success: false, message: "Image not found in this category!" });
        }

        console.log("Found image URL:", imageUrl);

        // Extract correct public_id
        const getPublicIdFromUrl = (imageUrl) => {
            const parts = imageUrl.split('/');
            const index = parts.findIndex(part => part === "upload") + 1;
            return parts.slice(index).join('/').split('.')[0]; // Extracts full path
        };

        const publicId = getPublicIdFromUrl(imageUrl);
        console.log("Extracted Cloudinary public ID:", publicId);

        // Delete image from Cloudinary
        cloudinary.uploader.destroy(publicId, async function (error, result) {
            if (error) {
                console.error("Cloudinary delete error:", error);
                return res.status(500).json({ success: false, message: "Failed to delete from Cloudinary" });
            }
            console.log("Cloudinary delete result:", result);

            if (result.result !== 'ok') {
                return res.status(500).json({ success: false, message: "Cloudinary deletion failed" });
            }

            // Remove image from MongoDB category
            category.images = category.images.filter(img => img !== imageUrl);
            await category.save();

            return res.status(200).json({
                success: true,
                message: "Image deleted successfully!",
                updatedCategory: category
            });
        });

    } catch (error) {
        console.error("Error deleting image:", error);
        return res.status(500).json({ success: false, message: "Internal server error while deleting image" });
    }
});




router.delete(`/:id`, async (req, res) => {
    try {
        // Find the category
        const category = await Category.findById(req.params.id);
        if (!category) {
            return res.status(404).json({
                message: 'Category not found!',
                success: false
            });
        }

        // Delete images from Cloudinary if they exist
        if (category.images && category.images.length !== 0) {
            for (const imageUrl of category.images) {
                // Extract public_id from Cloudinary URL
                const publicId = imageUrl.split('/').pop().split('.')[0];

                try {
                    await cloudinary.uploader.destroy(publicId);
                } catch (cloudinaryError) {
                    console.error(`Error deleting image ${publicId} from Cloudinary:`, cloudinaryError);
                }
            }
        }

        // Delete category from MongoDB
        await Category.findByIdAndDelete(req.params.id);

        return res.status(200).json({
            success: true,
            message: 'Category deleted successfully!'
        });

    } catch (error) {
        console.error("Error deleting category:", error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error while deleting category'
        });
    }
});



router.put(`/:id`, async (req, res) => {
    try {
        const { name, color, images } = req.body;
        const categoryId = req.params.id;

        // Find the existing category
        const category = await Category.findById(categoryId);
        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'Category not found!',
            });
        }

        // Update category fields
        category.name = name || category.name;
        category.color = color || category.color;

        // Handle updating images
        if (images && Array.isArray(images)) {
            category.images = images; // Update images array if new images are provided
        }

        // Save updated category
        const updatedCategory = await category.save();

        return res.status(200).json({
            success: true,
            message: 'Category updated successfully!',
            updatedCategory
        });

    } catch (error) {
        console.error("Error updating category:", error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error while updating category',
        });
    }
});


module.exports = router;