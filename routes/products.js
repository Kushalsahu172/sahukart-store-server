const { Category } = require('../models/category.js');
const {Product} = require('../models/products.js');
const {ImageUpload} = require('../models/imageUpload.js');
const express = require('express');
const router = express.Router();
const multer  = require('multer');
const fs = require("fs");
const { RecentlyViewed } = require('../models/RecentlyViewed.js');

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
    imagesArr = [];  // Define imagesArr inside the route, not globally

    try {
        for (let i = 0; i < req.files.length; i++) {
            const options = {
                use_filename: true,
                unique_filename: false,
                overwrite: false,
            };

            const result = await cloudinary.uploader.upload(req.files[i].path, options);
            imagesArr.push(result.secure_url);
            fs.unlinkSync(`uploads/${req.files[i].filename}`); // Remove uploaded file from local storage
        }

        // Save uploaded images to database
        let imagesUploaded = new ImageUpload({
            images: imagesArr,
        });

        await imagesUploaded.save();

        return res.status(200).json(imagesArr);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Image upload failed" });
    }
});


router.get(`/`, async (req, res) =>{

    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.perPage);
    const totalPosts = await Product.countDocuments();
    const totalPages = Math.ceil(totalPosts / perPage);

    if (page > totalPages) {
        return res.status(404).json({ message: "Page not found" })
    }

    let productList=[];

    if (req.query.minPrice !== undefined && req.query.maxPrice !== undefined) {
        productList = await Product.find({subCatId: req.query.subCatId}).populate("category");

        const filteredProducts = productList.filter(product => {
            if (req.query.minPrice && product.price < parseInt(+req.query.minPrice)) {
                return false;
            }
            if (req.query.maxPrice && product.price > parseInt(+req.query.maxPrice)) {
                return false;
            }
            return true;
        });
        
        if(!productList) {
            res.status(500).json({success: false})
        }
        return res.status(200).json({
            "products": filteredProducts,
            "totalPages": totalPages,
            "page": page
        });

    } 
    else if (req.query.page !== undefined && req.query.perPage !== undefined) {
        productList = await Product.find().populate("category").skip((page - 1) * perPage)
            .limit(perPage)
            .exec();
        
        if (!productList) {
            res.status(500).json({ success: false })
        }
        return res.status(200).json({
            "products": productList,
            "totalPages": totalPages,
            "page": page
        });
    }
    
    else {
        productList = await Product.find(req.query).populate("category");
        if (!productList) {
            res.status(500).json({ success: false })
        }
        return res.status(200).json({
            "products" : productList,
            "totalPages": totalPages,
            "page": page
        });
    }

});

router.get(`/get/count`, async(req, res) => {
    const productsCount = await Product.countDocuments();

    if(!productsCount) {
        res.status(500).json({success: false})
    }
    res.send({
        productsCount: productsCount
    });
})


// router.get(`/subCat/get/count`, async(req, res) => {
//     const productsCount = await Product.countDocuments({parentId: !undefined});

//     if(!productsCount) {
//         res.status(500).json({success: false})
//     }
//     res.send({
//         productsCount: productsCount
//     });
// })

router.get(`/featured`, async (req, res) =>{
    const productList = await Product.find({isFeatured:true});
    if(!productList) {
        res.status(500).json({success: false})
    }

    return res.status(200).json(productList);
});


router.get(`/recentlyViewed`, async (req, res) => {
    let productList = [];
    productList = await Product.find(req.query).populate("category");

        if (!productList) {
            res.status(500).json({ success: false })
        }

        return res.status(200).json(productList);
})


router.post(`/recentlyViewed`, async (req, res) => {

    let findProduct = await RecentlyViewed.find({prodId:req.body.prodId});

    var product;

    if(findProduct.length===0){
        product = new RecentlyViewed({
            prodId:req.body.id,
            name: req.body.name,
            subCat: req.body.subCat,
            description: req.body.description,
            images: req.body.images,
            brand: req.body.brand,
            price: req.body.price,
            oldPrice: req.body.oldPrice,
            catName: req.body.catName,
            subCatId: req.body.subCatId,
            category: req.body.category,
            countInStock: req.body.countInStock,
            rating: req.body.rating,
            isFeatured: req.body.isFeatured,
            discount: req.body.discount,
            size: req.body.size,
            productWeight: req.body.productWeight,
        });

        product = await product.save();

        if (!product) {
            res.status(500).json({
                error: err,
                success: false
            });
        }

        res.status(201).json(product);
    }

    
});


router.post(`/create`, async (req, res) => {
    try {
        const category = await Category.findById(req.body.category);
        if (!category) {
            return res.status(404).json({ message: "Invalid Category!" }); // Return JSON
        }

        const latestUpload = await ImageUpload.findOne().sort({ createdAt: -1 });

        let product = new Product({
            name: req.body.name,
            subCat: req.body.subCat,
            description: req.body.description,
            images: req.body.images.length ? req.body.images : (latestUpload ? latestUpload.images : []),
            brand: req.body.brand,
            price: req.body.price,
            oldPrice: req.body.oldPrice,
            catName: req.body.catName,
            subCatId: req.body.subCatId,
            category: req.body.category,
            countInStock: req.body.countInStock,
            rating: req.body.rating,
            isFeatured: req.body.isFeatured,
            discount: req.body.discount,
            size: req.body.size,
            productWeight: req.body.productWeight,
        });

        product = await product.save();
        if (!product) {
            return res.status(500).json({ message: "Failed to create product" });
        }

        return res.status(201).json(product);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Error creating product", error: error.message });
    }
});



router.get('/:id', async(req, res) => {
    productEditId = req.params.id;

    const product = await Product.findById(req.params.id);

    if(!product) {
        res.status(500).json({ message: 'The product with the given ID was not found.'})
    }
    return res.status(200).send(product);
})


router.delete('/deleteImage', async (req, res) => {
    const imgUrl = req.query.img;

    //console.log(imgUrl)

    const urlArr = imgUrl.split('/');
    const image = urlArr[urlArr.length -1];

    const imageName = image.split('.')[0];


    const response = await cloudinary.uploader.destroy(imageName, (error, result) => {

    })

    if (response) {
        res.status(200).send(response);
    }
});


router.delete('/:id', async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ message: "Product not found!", status: false });
        }

        // Delete images from Cloudinary
        for (let img of product.images) {
            const urlArr = img.split('/');
            const image = urlArr[urlArr.length - 1];
            const imageName = image.split('.')[0];

            if (imageName) {
                await cloudinary.uploader.destroy(imageName);
            }
        }

        // Delete the product
        await Product.findByIdAndDelete(req.params.id);

        res.status(200).json({ message: "Product deleted successfully!", status: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error while deleting product", error });
    }
});







router.put('/:id', async(req,res)=>{

    const product = await Product.findByIdAndUpdate(
        req.params.id,
        {
            name: req.body.name,
            subCat:req.body.subCat,
            description: req.body.description,
            images: req.body.images,
            brand: req.body.brand,
            price: req.body.price,
            oldPrice: req.body.oldPrice,
            subCatId: req.body.subCatId,
            catName: req.body.catName,
            category: req.body.category,
            countInStock: req.body.countInStock,
            rating: req.body.rating,
            numReviews: req.body.numReviews,
            isFeatured: req.body.isFeatured,
            discount: req.body.discount,
            size: req.body.size,
            productWeight: req.body.productWeight,
        },
        {new:true}
    );

    if(!product){
        res.status(404).json({
            message:'the product can not be updated!',
            status:false
        })
    }

    imagesArr = [];

    res.status(200).json({
        message:'the product is updated!',
        status:true
    });
})

module.exports = router;