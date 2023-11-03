//==============================================================================
// Vertex shader program:
var VSHADER_SOURCE =
 `precision mediump float;							// req'd in OpenGL ES if we use 'float'
  //
  uniform   int u_runMode;							// particle system state: 
  																	// 0=reset; 1= pause; 2=step; 3=run
  attribute vec4 a_Position;
  attribute vec3 a_Color; 
  attribute float a_Diam;
  uniform   mat4 u_mvpMat;
  varying   vec4 v_Color; 
  void main() {
    gl_PointSize = 10.0 * a_Diam;
	gl_Position = u_mvpMat * a_Position;
	v_Color = vec4(a_Color[0], a_Color[1], a_Color[2], 1.0);
  }`;

//==============================================================================
// Fragment shader program:
var FSHADER_SOURCE =
 `precision mediump float; 
  varying vec4 v_Color; 
  void main() {
    float dist = distance(gl_PointCoord, vec2(0.5, 0.5)); 
    if(dist < 0.5) { 
	  	//gl_FragColor = vec4((1.0-2.0*dist)*v_Color.rgb, 1.0);
		  gl_FragColor = vec4(v_Color.rgb, 1.0);
	  } else { discard; }
  }`;

var gl;   // webGL Rendering Context.  Created in main(), used everywhere.
var g_canvas; // our HTML-5 canvas object that uses 'gl' for drawing.
var g_digits = 5; // # of digits printed on-screen (e.g. x.toFixed(g_digits);

// For keyboard, mouse-click-and-drag: -----------------
var isDrag=false;		// mouse-drag: true when user holds down mouse button
var xMclik=0.0;			// last mouse button-down position (in CVV coords)
var yMclik=0.0;   
var xMdragTot=0.0;	// total (accumulated) mouse-drag amounts (in CVV coords).
var yMdragTot=0.0;  

var mvpMat = new Matrix4();
var u_mvpMat_loc;

//--Animation---------------
var g_isClear = 1;		  // 0 or 1 to enable or disable screen-clearing in the
    									// draw() function. 'C' or 'c' key toggles in myKeyPress().
var g_last = Date.now();				//  Timestamp: set after each frame of animation,
																// used by 'animate()' function to find how much
																// time passed since we last updated our canvas.
var g_stepCount = 0;						// Advances by 1 for each timestep, modulo 1000, 
																// (0,1,2,3,...997,998,999,0,1,2,..) to identify 
																// WHEN the ball bounces.  RESET by 'r' or 'R' key.

var g_timeStep = 1000.0/60.0;			// current timestep in milliseconds (init to 1/60th sec) 
var g_timeStepMin = g_timeStep;   //holds min,max timestep values since last keypress.
var g_timeStepMax = g_timeStep;


// Our first global particle system object; contains 'state variables' s1,s2;
//---------------------------------------------------------
var g_partA = new PartSys();   // create our first particle-system object;
                              // for code, see PartSys.js


//------------cam variables----------------------
var g_EyeX = 0; var g_EyeY = -5; var g_EyeZ = 1; 

var theta = Math.PI / 2;
var aimTilt = 0.0;
var tiltStep = .05;


function main() {
//==============================================================================
  // Retrieve <canvas> element where we will draw using WebGL
  g_canvas = document.getElementById('webgl');
	gl = g_canvas.getContext("webgl", { preserveDrawingBuffer: true});
	// NOTE:{preserveDrawingBuffer: true} disables HTML-5default screen-clearing, 
	// so that our draw() function will over-write previous on-screen results 
	// until we call the gl.clear(COLOR_BUFFER_BIT); function. )
  if (!gl) {
    console.log('main() Failed to get the rendering context for WebGL');
    return;
  }  
	// Register the Keyboard & Mouse Event-handlers------------------------------
	// When users move, click or drag the mouse and when they press a key on the 
	// keyboard the operating system creates a simple text-based 'event' message.
	// Your Javascript program can respond to 'events' if you:
	// a) tell JavaScript to 'listen' for each event that should trigger an
	//   action within your program: call the 'addEventListener()' function, and 
	// b) write your own 'event-handler' function for each of the user-triggered 
	//    actions; Javascript's 'event-listener' will call your 'event-handler'
	//		function each time it 'hears' the triggering event from users.
	//
  // KEYBOARD:----------------------------------------------
  // The 'keyDown' and 'keyUp' events respond to ALL keys on the keyboard,
  //      including shift,alt,ctrl,arrow, pgUp, pgDn,f1,f2...f12 etc. 
	window.addEventListener("keydown", myKeyDown, false);
	// After each 'keydown' event, call the 'myKeyDown()' function.  The 'false' 
	// arg (default) ensures myKeyDown() call in 'bubbling', not 'capture' stage)
	// ( https://www.w3schools.com/jsref/met_document_addeventlistener.asp )
	window.addEventListener("keyup", myKeyUp, false);
	// Called when user RELEASES the key.  Now rarely used...
	// MOUSE:--------------------------------------------------
	// Create 'event listeners' for a few vital mouse events 
	// (others events are available too... google it!).  
	window.addEventListener("mousedown", myMouseDown); 
	// (After each 'mousedown' event, browser calls the myMouseDown() fcn.)
  window.addEventListener("mousemove", myMouseMove); 
	window.addEventListener("mouseup", myMouseUp);	
	window.addEventListener("click", myMouseClick);				
	window.addEventListener("dblclick", myMouseDblClick); 
	// Note that these 'event listeners' will respond to mouse click/drag 
	// ANYWHERE, as long as you begin in the browser window 'client area'.  
	// You can also make 'event listeners' that respond ONLY within an HTML-5 
	// element or division. For example, to 'listen' for 'mouse click' only
	// within the HTML-5 canvas where we draw our WebGL results, try:
	// g_canvasID.addEventListener("click", myCanvasClick);
  //
	// Wait wait wait -- these 'event listeners' just NAME the function called 
	// when the event occurs!   How do the functionss get data about the event?
	//  ANSWER1:----- Look it up:
	//    All event handlers receive one unified 'event' object:
	//	  https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent
	//  ANSWER2:----- Investigate:
	// 		All Javascript functions have a built-in local variable/object named 
	//    'argument'.  It holds an array of all values (if any) found in within
	//	   the parintheses used in the function call.
  //     DETAILS:  https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Functions/arguments
	// END Keyboard & Mouse Event-Handlers---------------------------------------

  // Initialize shaders
  if (!initShaders(gl, VSHADER_SOURCE, FSHADER_SOURCE)) {
    console.log('main() Failed to intialize shaders.');
    return;
  }
  gl.clearColor(0.25, 0.25, 0.25, 1);	 // RGBA color for clearing WebGL framebuffer
  gl.clear(gl.COLOR_BUFFER_BIT);		// clear it once to set that color as bkgnd.

  u_mvpMat_loc = gl.getUniformLocation(gl.program, 'u_mvpMat');

   if(!u_mvpMat_loc) {
		console.log('Failed to get u_ModelMatrix variable location');
	return;
   }

  // Initialize Particle systems:
  g_partA.initBouncy2D();        // create a 2D bouncy-ball system where
                                    // 2 particles bounce within -0.9 <=x,y<0.9
                                    // and z=0.
  printControls(); 	// Display (initial) particle system values as text on webpage
	
  drawResize();

  var tick = function() {
	
	updateUI();
	
    g_timeStep = animate(); 
                      // find how much time passed (in milliseconds) since the
                      // last call to 'animate()'.
    if(g_timeStep > 200) {   // did we wait > 0.2 seconds? 
      // YES. That's way too long for a single time-step; somehow our particle
      // system simulation got stopped -- perhaps user switched to a different
      // browser-tab or otherwise covered our browser window's HTML-5 canvas.
      // Resume simulation with a normal-sized time step:
      g_timeStep = 1000/60;
      }
    // Update min/max for timeStep:
    if     (g_timeStep < g_timeStepMin) g_timeStepMin = g_timeStep;  
    else if(g_timeStep > g_timeStepMax) g_timeStepMax = g_timeStep;
  	drawAll(g_partA.partCount); // compute new particle state at current time
    requestAnimationFrame(tick, g_canvas);
                      // Call tick() again 'at the next opportunity' as seen by 
                      // the HTML-5 element 'g_canvas'.
  };
  tick();
}

function updateUI() {

	// spring length and damp
	springLen = document.getElementById('springLen_slider').value;
	document.getElementById('springLen').innerHTML = 'Spring Length: ' + springLen;

	springDamp = document.getElementById('springDamp_slider').value;
	document.getElementById('springDamp').innerHTML = 'Spring Damp: ' + springDamp;

	// boid center
	boidX = document.getElementById('x_slider').value;
	boidY = document.getElementById('y_slider').value;
	boidZ = document.getElementById('z_slider').value;

	document.getElementById('boidCenter').innerHTML = 'Boid Center: (' + boidX + ', ' + boidY + ', ' + boidZ + ')';

	for(var k = 0; k < g_partA.forceList.length; k++) {  
		switch(g_partA.forceList[k].forceType) {  
			case F_SPRING:
				g_partA.forceList[k].K_restLength = springLen;
				g_partA.forceList[k].K_springDamp = springDamp;
				break;
			case F_BUBBLE:
				g_partA.forceList[k].ctr.elements[0] = boidX;
				g_partA.forceList[k].ctr.elements[1] = boidY;
				g_partA.forceList[k].ctr.elements[2] = boidZ;
				break;
			default:
				break;
		}
	}
	
			
  /*
	document.getElementById('Kd').innerHTML = 'Diffuse reflection: ' + 
	  document.getElementById('Kd_slider').value;
	
	document.getElementById('Ks').innerHTML = 'Specular reflection: ' + 
	  document.getElementById('Ks_slider').value;  
  
	document.getElementById('Shiny').innerHTML = 'Shininess: ' + 
	  document.getElementById('Shiny_slider').value;  
	  */
  
  
}

function animate() {
//==============================================================================  
// Returns how much time (in milliseconds) passed since the last call to this fcn.
  var now = Date.now();	        
  var elapsed = now - g_last;	// amount of time passed, in integer milliseconds
  g_last = now;               // re-set our stopwatch/timer.

  // INSTRUMENTATION:  (delete if you don't care how much the time-steps varied)
  g_stepCount = (g_stepCount +1)%1000;		// count 0,1,2,...999,0,1,2,...
  //-----------------------end instrumentation
  return elapsed;
}

function drawAll() {
//============================================================================== 
  // Clear WebGL frame-buffer? (The 'c' or 'C' key toggles g_isClear between 0 & 1).
  if(g_isClear == 1) gl.clear(gl.COLOR_BUFFER_BIT);
	
// update particle system state? 
  if(  g_partA.runMode > 1) {					// 0=reset; 1= pause; 2=step; 3=run
    // YES! advance particle system(s) by 1 timestep.
		if(g_partA.runMode == 2) { // (if runMode==2, do just one step & pause)
		  g_partA.runMode=1;	
		  }                                 
    //==========================================
    //===========================================
    //
    //  PARTICLE SIMULATION LOOP: (see Lecture Notes D)
    //
    //==========================================
    //==========================================    
		// Make our 'bouncy-ball' move forward by one timestep, but now the 's' key 
		// will select which kind of solver to use by changing g_partA.solvType:
     g_partA.applyForces(g_partA.s1, g_partA.forceList);  // find current net force on each particle
    g_partA.dotFinder(g_partA.s1dot, g_partA.s1); // find time-derivative s1dot from s1;
    g_partA.solver();         // find s2 from s1 & related states.
    g_partA.doConstraints();  // Apply all constraints.  s2 is ready!

	var vpAspect = g_canvas.width / g_canvas.height;	// this camera: width/height.

	//----------------------Create, fill LEFT viewport------------------------
	gl.viewport(0,											// Viewport lower-left corner
	0,			// location(in pixels)
	g_canvas.width, 				// viewport width,
	g_canvas.height);			// viewport height in pixels.
	//==================================Set Camera==================================
	// Calculate look-at point
	g_LookX = g_EyeX + Math.cos(theta);
	g_LookY = g_EyeY + Math.sin(theta);
	g_LookZ = g_EyeZ + aimTilt;
	// Set identity matrix
	mvpMat.setIdentity();
	//==============================================================================
	mvpMat.perspective( 40.0,   // FOVY: top-to-bottom vertical image angle, in degrees
                        vpAspect,    // Image Aspect Ratio: camera lens width/height
                        1.0,    // camera z-near distance (always positive; frustum begins at z = -znear)
                        10.0);  // camera z-far distance (always positive; frustum ends at z = -zfar)
	//==============================================================================
  	mvpMat.lookAt( 	g_EyeX, g_EyeY, g_EyeZ,     // eye position
	  				g_LookX, g_LookY, g_LookZ,  // look-at point 
					0, 0, 1);					// View UP vector.
	//==============================================================================
  	//mvpMat.lookAt( 	0, 0, 5,     // eye position
	//  				0, 0, 0,  // look-at point 
	//				0, 1, 0);					// View UP vector.
	//==============================================================================
	gl.uniformMatrix4fv(u_mvpMat_loc, false, mvpMat.elements);


  	g_partA.render();         // transfer current state to VBO, set uniforms, draw it!
    g_partA.step();           // Make s2 the new current state s1.s
    //===========================================
    //===========================================
	  }
	else {    // runMode==0 (reset) or ==1 (pause): re-draw existing particles.
	  g_partA.render();
	  }
	printControls();		// Display particle-system status on-screen. 
}

//===================Mouse and Keyboard event-handling Callbacks===============
//=============================================================================
function myMouseDown(ev) {
//=============================================================================
// Called when user PRESSES down any mouse button;
// 									(Which button?    console.log('ev.button='+ev.button);   )
// 		ev.clientX, ev.clientY == mouse pointer location, but measured in webpage 
//		pixels: left-handed coords; UPPER left origin; Y increases DOWNWARDS (!)  

// Create right-handed 'pixel' coords with origin at WebGL canvas LOWER left;
  var rect = ev.target.getBoundingClientRect();	// get canvas corners in pixels
  var xp = ev.clientX - rect.left;									  // x==0 at canvas left edge
  var yp = g_canvas.height - (ev.clientY - rect.top);	// y==0 at canvas bottom edge
//  console.log('myMouseDown(pixel coords): xp,yp=\t',xp,',\t',yp);
  
	// Convert to Canonical View Volume (CVV) coordinates too:
  var x = (xp - g_canvas.width/2)  / 		// move origin to center of canvas and
  						 (g_canvas.width/2);			// normalize canvas to -1 <= x < +1,
	var y = (yp - g_canvas.height/2) /		//										 -1 <= y < +1.
							 (g_canvas.height/2);
//	console.log('myMouseDown(CVV coords  ):  x, y=\t',x,',\t',y);
	
	isDrag = true;											// set our mouse-dragging flag
	xMclik = x;													// record where mouse-dragging began
	yMclik = y;

};

function myMouseMove(ev) {
//==============================================================================
// Called when user MOVES the mouse with a button already pressed down.
// 									(Which button?   console.log('ev.button='+ev.button);    )
// 		ev.clientX, ev.clientY == mouse pointer location, but measured in webpage 
//		pixels: left-handed coords; UPPER left origin; Y increases DOWNWARDS (!)  

	if(isDrag==false) return;				// IGNORE all mouse-moves except 'dragging'

	// Create right-handed 'pixel' coords with origin at WebGL canvas LOWER left;
  var rect = ev.target.getBoundingClientRect();	// get canvas corners in pixels
  var xp = ev.clientX - rect.left;									  // x==0 at canvas left edge
	var yp = g_canvas.height - (ev.clientY - rect.top);	// y==0 at canvas bottom edge
//  console.log('myMouseMove(pixel coords): xp,yp=\t',xp.toFixed(g_digits),',\t',yp.toFixed(g_digits));

	// Convert to Canonical View Volume (CVV) coordinates too:
  var x = (xp - g_canvas.width/2)  / 		// move origin to center of canvas and
  						 (g_canvas.width/2);			// normalize canvas to -1 <= x < +1,
	var y = (yp - g_canvas.height/2) /		//										 -1 <= y < +1.
							 (g_canvas.height/2);
//	console.log('myMouseMove(CVV coords  ):  x, y=\t',x,',\t',y);

	// find how far we dragged the mouse:
	xMdragTot += (x - xMclik);					// Accumulate change-in-mouse-position,&
	yMdragTot += (y - yMclik);
	xMclik = x;													// Make next drag-measurement from here.
	yMclik = y;
// (? why no 'document.getElementById() call here, as we did for myMouseDown()
// and myMouseUp()? Because the webpage doesn't get updated when we move the 
// mouse. Put the web-page updating command in the 'draw()' function instead)
};

function myMouseUp(ev) {
//==============================================================================
// Called when user RELEASES mouse button pressed previously.
// 									(Which button?   console.log('ev.button='+ev.button);    )
// 		ev.clientX, ev.clientY == mouse pointer location, but measured in webpage 
//		pixels: left-handed coords; UPPER left origin; Y increases DOWNWARDS (!)  

// Create right-handed 'pixel' coords with origin at WebGL canvas LOWER left;
  var rect = ev.target.getBoundingClientRect();	// get canvas corners in pixels
  var xp = ev.clientX - rect.left;									  // x==0 at canvas left edge
	var yp = g_canvas.height - (ev.clientY - rect.top);	// y==0 at canvas bottom edge
//  console.log('myMouseUp  (pixel coords): xp,yp=\t',xp,',\t',yp);
  
	// Convert to Canonical View Volume (CVV) coordinates too:
  var x = (xp - g_canvas.width/2)  / 		// move origin to center of canvas and
  						 (g_canvas.width/2);			// normalize canvas to -1 <= x < +1,
	var y = (yp - g_canvas.height/2) /		//										 -1 <= y < +1.
							 (g_canvas.height/2);
//	console.log('myMouseUp  (CVV coords  ):  x, y=\t',x,',\t',y);
	
	isDrag = false;											// CLEAR our mouse-dragging flag, and
	// accumulate any final bit of mouse-dragging we did:
	xMdragTot += (x - xMclik);
	yMdragTot += (y - yMclik);
//	console.log('myMouseUp: xMdragTot,yMdragTot =',xMdragTot.toFixed(g_digits),',\t', 
//	                                               yMdragTot.toFixed(g_digits));

};

function myMouseClick(ev) {
//=============================================================================
// Called when user completes a mouse-button single-click event 
// (e.g. mouse-button pressed down, then released)
// 									   
//    WHICH button? try:  console.log('ev.button='+ev.button); 
// 		ev.clientX, ev.clientY == mouse pointer location, but measured in webpage 
//		pixels: left-handed coords; UPPER left origin; Y increases DOWNWARDS (!) 
//    See myMouseUp(), myMouseDown() for conversions to  CVV coordinates.

  // STUB
//	console.log("myMouseClick() on button: ", ev.button); 
}	

function myMouseDblClick(ev) {
//=============================================================================
// Called when user completes a mouse-button double-click event 
// 									   
//    WHICH button? try:  console.log('ev.button='+ev.button); 
// 		ev.clientX, ev.clientY == mouse pointer location, but measured in webpage 
//		pixels: left-handed coords; UPPER left origin; Y increases DOWNWARDS (!) 
//    See myMouseUp(), myMouseDown() for conversions to  CVV coordinates.

  // STUB
//	console.log("myMouse-DOUBLE-Click() on button: ", ev.button); 
}	

function myKeyDown(kev) {
//============================================================================
// Called when user presses down ANY key on the keyboard;
//
// For a light, easy explanation of keyboard events in JavaScript,
// see:    http://www.kirupa.com/html5/keyboard_events_in_javascript.htm
// For a thorough explanation of a mess of JavaScript keyboard event handling,
// see:    http://javascript.info/tutorial/keyboard-events
//
// NOTE: Mozilla deprecated the 'keypress' event entirely, and in the
//        'keydown' event deprecated several read-only properties I used
//        previously, including kev.charCode, kev.keyCode. 
//        Revised 2/2019:  use kev.key and kev.code instead.
//
/*
	// On console, report EVERYTHING about this key-down event:  
  console.log("--kev.code:",      kev.code,   "\t\t--kev.key:",     kev.key, 
              "\n--kev.ctrlKey:", kev.ctrlKey,  "\t--kev.shiftKey:",kev.shiftKey,
              "\n--kev.altKey:",  kev.altKey,   "\t--kev.metaKey:", kev.metaKey);
*/

  // RESET our g_timeStep min/max recorder on every key-down event:
  g_timeStepMin = g_timeStep;
  g_timeStepMax = g_timeStep;

  switch(kev.code) {
	case "KeyP":
	  if(g_partA.runMode == 3) g_partA.runMode = 1;		// if running, pause
						  else g_partA.runMode = 3;		          // if paused, run.
	  console.log("p/P key: toggle Pause/unPause!");   			// print on console,
			break;
    case "KeyR":    // r/R for RESET: 
      if(kev.shiftKey==false) {   // 'r' key: SOFT reset; boost velocity only
  		  g_partA.runMode = 3;  // RUN!
        var j=0; // array index for particle i
        for(var i = 0; i < g_partA.partCount; i += 1, j+= PART_MAXVAR) {
          g_partA.roundRand();  // make a spherical random var.
    			if(  g_partA.s2[j + PART_XVEL] > 0.0) // ADD to positive velocity, and 
    			     g_partA.s2[j + PART_XVEL] += 1.7 + 0.4*g_partA.randX*g_partA.INIT_VEL;
    			                                      // SUBTRACT from negative velocity: 
    			else g_partA.s2[j + PART_XVEL] -= 1.7 + 0.4*g_partA.randX*g_partA.INIT_VEL; 

    			if(  g_partA.s2[j + PART_YVEL] > 0.0) 
    			     g_partA.s2[j + PART_YVEL] += 1.7 + 0.4*g_partA.randY*g_partA.INIT_VEL; 
    			else g_partA.s2[j + PART_YVEL] -= 1.7 + 0.4*g_partA.randY*g_partA.INIT_VEL;

    			if(  g_partA.s2[j + PART_ZVEL] > 0.0) 
    			     g_partA.s2[j + PART_ZVEL] += 1.7 + 0.4*g_partA.randZ*g_partA.INIT_VEL; 
    			else g_partA.s2[j + PART_ZVEL] -= 1.7 + 0.4*g_partA.randZ*g_partA.INIT_VEL;
    			}
      }
      else {      // HARD reset: position AND velocity, BOTH state vectors:
  		  g_partA.runMode = 0;			// RESET!
        // Reset state vector s1 for ALL particles:
        var j=0; // array index for particle i
        for(var i = 0; i < g_partA.partCount; i += 1, j+= PART_MAXVAR) {
              g_partA.roundRand();
        			g_partA.s2[j + PART_XPOS] =  -0.9;      // lower-left corner of CVV
        			g_partA.s2[j + PART_YPOS] =  -0.9;      // with a 0.1 margin
        			g_partA.s2[j + PART_ZPOS] =  0.0;	
        			g_partA.s2[j + PART_XVEL] =  3.7 + 0.4*g_partA.randX*g_partA.INIT_VEL;	
        			g_partA.s2[j + PART_YVEL] =  3.7 + 0.4*g_partA.randY*g_partA.INIT_VEL; // initial velocity in meters/sec.
              g_partA.s2[j + PART_ZVEL] =  3.7 + 0.4*g_partA.randZ*g_partA.INIT_VEL;
              // do state-vector s2 as well: just copy all elements of the float32array.
              g_partA.s2.set(g_partA.s1);
        } // end for loop
      } // end HARD reset
	  console.log("r/R: soft/hard Reset");      // print on console,
      break;
	case "KeyW":
		g_EyeX = Math.cos(theta) *  .5 + g_EyeX;
		g_EyeY = Math.sin(theta) *  .5 + g_EyeY;
		g_EyeZ = aimTilt * .5 + g_EyeZ; 
		break;
	case "KeyA":
		g_EyeX = Math.sin(theta) * -.5 + g_EyeX;
		g_EyeY = Math.cos(theta) *  .5 + g_EyeY;
		break;
	case "KeyS":
		g_EyeX = Math.cos(theta) * -.5 + g_EyeX;
		g_EyeY = Math.sin(theta) * -.5 + g_EyeY;
		g_EyeZ = aimTilt * -.5 + g_EyeZ;
		break;
	case "KeyD":
		g_EyeX = Math.sin(theta) *  .5 + g_EyeX;
		g_EyeY = Math.cos(theta) * -.5 + g_EyeY;
		break;
	case "KeyZ":
			if(g_partA.solvType == SOLV_EULER) g_partA.solvType = SOLV_BACK_EULER;  
			else if (g_partA.solvType == SOLV_BACK_EULER) g_partA.solvType = SOLV_MIDPOINT; 
			else if (g_partA.solvType == SOLV_MIDPOINT) g_partA.solvType = SOLV_BACK_MIDPT; 
			else if (g_partA.solvType == SOLV_BACK_MIDPT) g_partA.solvType = SOLV_VEL_VERLET; 
			else g_partA.solvType = SOLV_EULER;  
			break;
	case "Space":
      g_partA.runMode = 2;
      console.log("SPACE bar: Single-step!");        // print on console.
      break;
	case "ArrowLeft": 	
			theta += Math.PI / 16;
			if (theta >= 2 * Math.PI) {
				theta = 0;
			}
  		break;
	case "ArrowRight":
			theta -= Math.PI / 16;
			if (theta <= -2 * Math.PI) {
				theta = 0;
			}
  		break;
	case "ArrowUp":		
			aimTilt += tiltStep;
			break;
	case "ArrowDown":
  			aimTilt += -tiltStep;
  		break;	
    default:
      break;
  }
}

function myKeyUp(kev) {
//=============================================================================
// Called when user releases ANY key on the keyboard.
// Rarely needed -- most code needs only myKeyDown().

	console.log("myKeyUp():\n--kev.code:",kev.code,"\t\t--kev.key:", kev.key);
}

function printControls() {
//==============================================================================
// Print current state of the particle system on the webpage:
	var recipTime = 1000.0 / g_timeStep;			// to report fractional seconds
	var recipMin  = 1000.0 / g_timeStepMin;
	var recipMax  = 1000.0 / g_timeStepMax; 
	var solvTypeTxt;
	switch (g_partA.solvType) {
		case 0:
			solvTypeTxt = 'Euler &emsp;&emsp;';
			break;
		case 1:
			solvTypeTxt = 'Midpoint &emsp;&emsp;';
			break;
		case 5:
			solvTypeTxt = 'Backward Euler &emsp;&emsp;';
			break;
		case 6:
			solvTypeTxt = 'Backward Midpoint &emsp;&emsp;';
			break;
		case 9:
			solvTypeTxt = 'Velocity Verlet &emsp;&emsp;';
			break;
		default:
			break;
	}
	
	document.getElementById('KeyControls').innerHTML = 
   			'<b>Solver = </b>' + solvTypeTxt + 
   			'<b>timeStep = </b> 1/' + recipTime.toFixed(3) + ' sec' +
   			                ' <b>min:</b> 1/' + recipMin.toFixed(3)  + ' sec' + 
   			                ' <b>max:</b> 1/' + recipMax.toFixed(3)  + ' sec<br>';
}


function onPlusButton() {
//==============================================================================
	g_partA.INIT_VEL *= 1.2;		// grow
	console.log('Initial velocity: '+g_partA.INIT_VEL);
}

function onMinusButton() {
//==============================================================================
	g_partA.INIT_VEL /= 1.2;		// shrink
	console.log('Initial velocity: '+g_partA.INIT_VEL);
}

function drawResize() {
	//==============================================================================
	// Called when user re-sizes their browser window , because our HTML file
	// contains:  <body onload="main()" onresize="winResize()">
	  
	  //Make canvas fill the top 3/4 of our browser window:
	  var xtraMargin = 100;    // keep a margin (otherwise, browser adds scroll-bars)
	  g_canvas.width = (innerWidth*8/10) - xtraMargin;
	  g_canvas.height = (innerHeight*8/10) - xtraMargin;
	  // IMPORTANT!  Need a fresh drawing in the re-sized viewports.
	  drawAll(); // draw in all viewports.
  }
