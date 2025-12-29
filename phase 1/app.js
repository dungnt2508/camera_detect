const video = document.getElementById("video");

navigator.mediaDevices.getUserMedia({
  video: { width: 1280, height: 720 }
}).then(stream => {
  video.srcObject = stream;
});


const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  45, // độ
  window.innerWidth / window.innerHeight, // tỉ lệ khung hình 
  0.1, // near plane
  100 // far plane
);
camera.position.z = 3;  // vị trí của camera ảo trong không gian 3D

const renderer = new THREE.WebGLRenderer({ alpha: true });  // nền trong suốt → thấy video phía sau.
renderer.setSize(window.innerWidth, window.innerHeight);  // full screen.
document.body.appendChild(renderer.domElement); // Append canvas vào DOM.


scene.add(new THREE.AmbientLight(0xffffff, 0.8)); //Ambient: ánh sáng nền, chống đen.

const light = new THREE.DirectionalLight(0xffffff, 0.8); // Directional: giả lập ánh sáng showroom.
light.position.set(0, 0, 5);
scene.add(light);

const geometry = new THREE.TorusGeometry(0.5, 0.15, 16, 100);
const material = new THREE.MeshStandardMaterial({ color: 0xffd700 });
const ring = new THREE.Mesh(geometry, material);

scene.add(ring);

function animate() {
    requestAnimationFrame(animate);
  
    ring.rotation.x += 0.01;
    ring.rotation.y += 0.01;
  
    renderer.render(scene, camera);
  }
  
  animate();
  