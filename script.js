// =====================================
// AI VISION ROBOT
// script.js
// =====================================


// HTML ELEMENTS

const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const capturedImage = document.getElementById("capturedImage");

const startCameraBtn =
document.getElementById("startCameraBtn");

const connectBtn =
document.getElementById("connectBtn");

const captureBtn =
document.getElementById("captureBtn");

const describeBtn =
document.getElementById("describeBtn");


const description =
document.getElementById("description");

const historyList =
document.getElementById("historyList");


const statusText =
document.getElementById("statusText");

const statusCircle =
document.getElementById("statusCircle");


const loading =
document.getElementById("loading");



let imageBase64="";

let port=null;

let cameraStream=null;



// =====================================
// CAMERA FUNCTION
// =====================================

async function startCamera(){


try{


// Get permission first

let temp =
await navigator.mediaDevices.getUserMedia({

video:true

});


temp.getTracks().forEach(track=>{

track.stop();

});



// Get all devices

let devices =
await navigator.mediaDevices.enumerateDevices();



let cameras =
devices.filter(device=>

device.kind==="videoinput"

);



console.clear();

console.log(
"========= CAMERA LIST ========="
);



cameras.forEach((camera,index)=>{


console.log(

"Camera Number:",
index

);


console.log(

"Camera Name:",
camera.label

);


console.log(

"Camera ID:",
camera.deviceId

);


console.log("----------------------");


});



// ================================
// CHANGE THIS NUMBER IF REQUIRED
// ================================


let selectedCamera = cameras[1];



// Example:
// cameras[0] = Laptop camera
// cameras[1] = USB camera



if(!selectedCamera){


alert(
"No external camera found"
);


return;


}



console.log(
"SELECTED CAMERA:",
selectedCamera.label
);




// Open selected camera

cameraStream =

await navigator.mediaDevices.getUserMedia({

video:{


deviceId:{


exact:selectedCamera.deviceId


},


width:{

ideal:1280

},


height:{

ideal:720

}


}


});




// Display camera

video.srcObject =
cameraStream;



statusText.innerHTML =

"Connected: "
+
selectedCamera.label;



statusCircle.style.background="lime";



}

catch(error){


console.log(error);


alert(

"Camera access failed. Check permission."

);


}


}





// =====================================
// CAPTURE IMAGE
// =====================================


function captureImage(){



if(!video.srcObject){


alert(
"Start camera first"
);


return;


}



let ctx =
canvas.getContext("2d");



canvas.width =
video.videoWidth;


canvas.height =
video.videoHeight;



ctx.drawImage(

video,

0,

0

);



imageBase64 =

canvas.toDataURL(
"image/jpeg"
);



capturedImage.src =
imageBase64;



statusText.innerHTML =
"Image Captured";



addHistory(
"Image captured"
);



}





// =====================================
// AI DESCRIPTION
// =====================================


async function describeImage(){



if(imageBase64===""){


alert(
"Capture image first"
);


return;


}



loading.style.display="block";


description.innerHTML=
"AI analyzing image...";



try{


const analyzeEndpoints = [
    "http://localhost:3000/analyze",
    "http://localhost:3001/analyze",
    "http://localhost:3002/analyze",
    "http://localhost:3003/analyze",
    "http://localhost:3004/analyze",
    "http://localhost:3005/analyze",
    "http://localhost:3006/analyze",
    "http://localhost:3007/analyze"
];

let result = null;
let lastError = null;

for (const endpoint of analyzeEndpoints) {
    try {
        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                image: imageBase64
            })
        });

        if (!response.ok) {
            continue;
        }

        result = await response.json();
        break;
    } catch (error) {
        lastError = error;
    }
}

if (!result) {
    throw lastError || new Error("AI server unavailable");
}



loading.style.display="none";



description.innerHTML =
result.description;



speak(
result.description
);



addHistory(
"AI description generated"
);



}

catch(error){


console.log(error);


description.innerHTML=

"Cannot connect to AI server";


loading.style.display="none";


}


}





// =====================================
// SPEECH
// =====================================


function speak(text){


let speech =
new SpeechSynthesisUtterance(text);


speech.lang="en-US";

speech.rate=1;


window.speechSynthesis.speak(
speech
);


}





// =====================================
// HISTORY
// =====================================


function addHistory(text){



if(
historyList.children.length===1
&&
historyList.children[0].innerText
==="No detection yet."
)

{

historyList.innerHTML="";

}



let li =
document.createElement("li");


li.innerHTML =

new Date()
.toLocaleTimeString()
+
" - "
+
text;



historyList.prepend(li);



}





// =====================================
// ARDUINO CONNECTION
// =====================================


async function connectArduino(){


if(!("serial" in navigator)){


alert(
"Use Chrome or Edge browser"
);


return;


}



try{


port =
await navigator.serial.requestPort();



await port.open({

baudRate:9600

});



statusText.innerHTML =
"Arduino Connected";



readArduino();


}


catch(error){


console.log(error);


}


}





// =====================================
// READ ARDUINO
// =====================================


async function readArduino(){



let decoder =
new TextDecoderStream();



port.readable.pipeTo(
decoder.writable
);



let reader =
decoder.readable.getReader();



while(true){



let {value}=

await reader.read();



if(value){


console.log(
"Arduino:",
value
);



if(
value.includes("CAPTURE")
){


statusText.innerHTML =
"Object detected <15cm";



captureImage();



setTimeout(()=>{


describeImage();


},1000);



}


}


}


}





// =====================================
// BUTTON EVENTS
// =====================================


startCameraBtn.onclick =
startCamera;


captureBtn.onclick =
captureImage;


describeBtn.onclick =
describeImage;


connectBtn.onclick =
connectArduino;



statusCircle.style.background="red";

statusText.innerHTML =
"Waiting for sensor...";