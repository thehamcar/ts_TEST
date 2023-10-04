"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ort = __importStar(require("onnxruntime-node"));
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const sharp_1 = __importDefault(require("sharp"));
const fs_1 = __importDefault(require("fs"));
/**
 * Main function that sets up and starts a
 * web server on port 8080
 */
function main() {
    const app = (0, express_1.default)();
    const upload = (0, multer_1.default)();
    /**
     * The site root handler. Returns content of index.html file.
     */
    app.get("/", (req, res) => {
        res.end(fs_1.default.readFileSync("index.html", "utf8"));
    });
    /**
     * The handler of /detect endpoint that receives uploaded
     * image file, passes it through YOLOv8 object detection network and returns
     * an array of bounding boxes in format [[x1,y1,x2,y2,object_type,probability],..] as JSON
     */
    app.post('/detect', upload.single('image_file'), (req, res) => __awaiter(this, void 0, void 0, function* () {
        var _a;
        const boxes = yield detectObjectsOnImage((_a = req.file) === null || _a === void 0 ? void 0 : _a.buffer);
        res.json(boxes);
        const classCounts = countObjectTypes(boxes);
        console.log(classCounts);
    }));
    app.listen(8080, () => {
        console.log(`Server is listening on port 8080`);
    });
}
/**
 * Function receives an image, passes it through YOLOv8 neural network
 * and returns an array of detected objects and their bounding boxes
 * @param buf Input image body
 * @returns Array of bounding boxes in format [[x1,y1,x2,y2,object_type,probability],..]
 */
function detectObjectsOnImage(buf) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!buf) {
            return []; // or handle accordingly based on your requirements
        }
        const [input, imgWidth, imgHeight] = yield prepareInput(buf);
        const output = yield runModel(input);
        return processOutput(output, imgWidth, imgHeight);
    });
}
/**
 * Function used to convert input image to tensor,
 * required as an input to YOLOv8 object detection
 * network.
 * @param buf Content of uploaded file
 * @returns Array of pixels
 */
function prepareInput(buf) {
    return __awaiter(this, void 0, void 0, function* () {
        const img = (0, sharp_1.default)(buf);
        const md = yield img.metadata();
        const [imgWidth = 0, imgHeight = 0] = [md.width, md.height];
        const pixels = yield img.removeAlpha()
            .resize({ width: 640, height: 640, fit: 'fill' })
            .raw()
            .toBuffer();
        const red = [];
        const green = [];
        const blue = [];
        for (let index = 0; index < pixels.length; index += 3) {
            red.push(pixels[index] / 255.0);
            green.push(pixels[index + 1] / 255.0);
            blue.push(pixels[index + 2] / 255.0);
        }
        const input = [...red, ...green, ...blue];
        return [input, imgWidth, imgHeight];
    });
}
/**
 * Function used to pass provided input tensor to YOLOv8 neural network and return result
 * @param input Input pixels array
 * @returns Raw output of neural network as a flat array of numbers
 */
function runModel(input) {
    return __awaiter(this, void 0, void 0, function* () {
        const model = yield ort.InferenceSession.create("best.onnx");
        input = new ort.Tensor(Float32Array.from(input), [1, 3, 640, 640]);
        const outputs = yield model.run({ images: input });
        return outputs["output0"].data;
    });
}
/**
 * Function used to convert RAW output from YOLOv8 to an array of detected objects.
 * Each object contains the bounding box of this object, the type of object, and the probability
 * @param output Raw output of YOLOv8 network
 * @param imgWidth Width of the original image
 * @param imgHeight Height of the original image
 * @returns Array of detected objects in a format [[x1,y1,x2,y2,object_type,probability],..]
 */
function processOutput(output, imgWidth, imgHeight) {
    let boxes = [];
    for (let index = 0; index < 8400; index++) {
        const [classId, prob] = [...Array(4).keys()]
            .map(col => [col, output[8400 * (col + 4) + index]])
            .reduce((accum, item) => item[1] > accum[1] ? item : accum, [0, 0]);
        if (prob < 0.25) {
            continue;
        }
        const label = yoloClasses[classId];
        const xc = output[index];
        const yc = output[8400 + index];
        const w = output[2 * 8400 + index];
        const h = output[3 * 8400 + index];
        const x1 = (xc - w / 2) / 640 * imgWidth;
        const y1 = (yc - h / 2) / 640 * imgHeight;
        const x2 = (xc + w / 2) / 640 * imgWidth;
        const y2 = (yc + h / 2) / 640 * imgHeight;
        boxes.push([x1, y1, x2, y2, label, prob]);
    }
    boxes = boxes.sort((box1, box2) => box2[5] - box1[5]);
    const result = [];
    while (boxes.length > 0) {
        result.push(boxes[0]);
        boxes = boxes.filter(box => iou(boxes[0], box) < 0.7);
    }
    return result;
}
function countObjectTypes(result) {
    const classCounts = {};
    for (const [, , , , object_type] of result) {
        classCounts[object_type] = (classCounts[object_type] || 0) + 1;
    }
    return classCounts;
}
/**
 * Function calculates "Intersection-over-union" coefficient for specified two boxes
 * https://pyimagesearch.com/2016/11/07/intersection-over-union-iou-for-object-detection/.
 * @param box1 First box in format: [x1,y1,x2,y2,object_class,probability]
 * @param box2 Second box in format: [x1,y1,x2,y2,object_class,probability]
 * @returns Intersection over union ratio as a float number
 */
function iou(box1, box2) {
    return intersection(box1, box2) / union(box1, box2);
}
/**
 * Function calculates union area of two boxes.
 * @param box1 First box in format [x1,y1,x2,y2,object_class,probability]
 * @param box2 Second box in format [x1,y1,x2,y2,object_class,probability]
 * @returns Area of the boxes union as a float number
 */
function union(box1, box2) {
    const [box1_x1, box1_y1, box1_x2, box1_y2] = box1;
    const [box2_x1, box2_y1, box2_x2, box2_y2] = box2;
    const box1Area = (box1_x2 - box1_x1) * (box1_y2 - box1_y1);
    const box2Area = (box2_x2 - box2_x1) * (box2_y2 - box2_y1);
    return box1Area + box2Area - intersection(box1, box2);
}
/**
 * Function calculates intersection area of two boxes
 * @param box1 First box in format [x1,y1,x2,y2,object_class,probability]
 * @param box2 Second box in format [x1,y1,x2,y2,object_class,probability]
 * @returns Area of intersection of the boxes as a float number
 */
function intersection(box1, box2) {
    const [box1_x1, box1_y1, box1_x2, box1_y2] = box1;
    const [box2_x1, box2_y1, box2_x2, box2_y2] = box2;
    const x1 = Math.max(box1_x1, box2_x1);
    const y1 = Math.max(box1_y1, box2_y1);
    const x2 = Math.min(box1_x2, box2_x2);
    const y2 = Math.min(box1_y2, box2_y2);
    return (x2 - x1) * (y2 - y1);
}
/**
 * Array of YOLOv8 class labels
 */
const yoloClasses = [
    'Bus', 'Car', 'Motorcycle', 'Truck'
];
main();
//# sourceMappingURL=object_detector.js.map