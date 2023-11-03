//3456789_123456789_123456789_123456789_123456789_123456789_123456789_123456789_
// (JT: why the numbers? counts columns, helps me keep 80-char-wide listings)

// Set 'tab' to 2 spaces (for best on-screen appearance)

/*
================================================================================
================================================================================

                              PartSys Library

================================================================================
================================================================================
Prototype object that contains one complete particle system, including:
 -- state-variables s1, s2, & more that each describe a complete set of 
  particles at a fixed instant in time. Each state-var is a Float32Array that 
  hold the parameters of this.targCount particles (defined by constructor).
 -- Each particle is an identical sequence of floating-point parameters defined 
  by the extensible set of array-index names defined as constants near the top 
  of this file.  For example: PART_XPOS for x-coordinate of position, PART_YPOS 
  for particle's y-coord, and finally PART_MAXVAL defines total # of parameters.
  To access parameter PART_YVEL of the 17th particle in state var s1, use:
  this.s1[PART_YVEL + 17*PART_MAXVAL].
 -- A collection of 'force-causing' objects in forceList array
                                                  (see CForcer prototype below),
 -- A collection of 'constraint-imposing' objects in limitList array
                                                  (see CLimit prototype below),
 -- Particle-system computing functions described in class notes: 
  init(), applyForces(), dotFinder(), render(), doConstraints(), step().
 
 HOW TO USE:
 ---------------
 a) Be sure your WebGL rendering context is available as the global var 'gl'.
 b) Create a global variable for each independent particle system:
  e.g.    g_PartA = new PartSys(500);   // 500-particle fire-like system 
          g_partB = new PartSys(32);    //  32-particle spring-mass system
          g_partC = new PartSys(1024);  // 1024-particle smoke-like system
          ...
 c) Modify each particle-system as needed to get desired results:
    g_PartA.init(3);  g_PartA.solvType = SOLV_ADAMS_BASHFORTH; etc...
 d) Be sure your program's animation method (e.g. 'drawAll') calls the functions
    necessary for the simulation process of all particle systems, e.g.
      in main(), call g_partA.init(), g_partB.init(), g_partC.init(), ... etc
      in drawAll(), call:
        g_partA.applyForces(), g_partB.applyForces(), g_partC.applyForces(), ...
        g_partA.dotFinder(),   g_partB.dotFinder(),   g_partC.dotFinder(), ...
        g_partA.render(),      g_partB.render(),      g_partC.render(), ...
        g_partA.solver(),      g_partB.solver(),      g_partC.solver(), ...
        g_partA.doConstraint(),g_partB.doConstraint(),g_partC.doConstraint(),...
        g_partA.step(),        g_partB.step(),        g_partC.step().

*/

// Array-name consts for all state-variables in PartSys object:
/*------------------------------------------------------------------------------
     Each state-variable is a Float32Array object that holds 'this.partCount' 
particles. For each particle the state var holds exactly PART_MAXVAR elements 
(aka the 'parameters' of the particle) arranged in the sequence given by these 
array-name consts below.  
     For example, the state-variable object 'this.s1' is a Float32Array that 
holds this.partCount particles, and each particle is described by a sequence of
PART_MAXVAR floating-point parameters; in other words, the 'stride' that moves
use from a given parameter in one particle to the same parameter in the next
particle is PART_MAXVAR. Suppose we wish to find the Y velocity parameter of 
particle number 17 in s1 ('first' particle is number 0): we can
get that value if we write: this.s1[PART_XVEL + 17*PART_MAXVAR].
------------------------------------------------------------------------------*/
const PART_XPOS     = 0;  //  position    
const PART_YPOS     = 1;
const PART_ZPOS     = 2;
const PART_WPOS     = 3;            // (why include w? for matrix transforms; 
                                    // for vector/point distinction
const PART_XVEL     = 4;  //  velocity -- ALWAYS a vector: x,y,z; no w. (w==0)    
const PART_YVEL     = 5;
const PART_ZVEL     = 6;
const PART_X_FTOT   = 7;  // force accumulator:'ApplyForces()' fcn clears
const PART_Y_FTOT   = 8;  // to zero, then adds each force to each particle.
const PART_Z_FTOT   = 9;        
const PART_R        =10;  // color : red,green,blue, alpha (opacity); 0<=RGBA<=1.0
const PART_G        =11;  
const PART_B        =12;
const PART_MASS     =13;  	// mass, in kilograms
const PART_DIAM 	  =14;	// on-screen diameter (in pixels)
const PART_RENDMODE =15;	// on-screen appearance (square, round, or soft-round)
 // Other useful particle values, currently unused
const PART_AGE      =16;  // # of frame-times until re-initializing (Reeves Fire)
/*
const PART_CHARGE   =17;  // for electrostatic repulsion/attraction
const PART_MASS_VEL =18;  // time-rate-of-change of mass.
const PART_MASS_FTOT=19;  // force-accumulator for mass-change
const PART_R_VEL    =20;  // time-rate-of-change of color:red
const PART_G_VEL    =21;  // time-rate-of-change of color:grn
const PART_B_VEL    =22;  // time-rate-of-change of color:blu
const PART_R_FTOT   =23;  // force-accumulator for color-change: red
const PART_G_FTOT   =24;  // force-accumulator for color-change: grn
const PART_B_FTOT   =25;  // force-accumulator for color-change: blu
*/
const PART_MAXVAR   =17;  // Size of array in CPart uses to store its values.


// Array-Name consts that select PartSys objects' numerical-integration solver:
//------------------------------------------------------------------------------
// EXPLICIT methods: GOOD!
//    ++ simple, easy to understand, fast, but
//    -- Requires tiny time-steps for stable stiff systems, because
//    -- Errors tend to 'add energy' to any dynamical system, driving
//        many systems to instability even with small time-steps.
const SOLV_EULER       = 0;       // Euler integration: forward,explicit,...
const SOLV_MIDPOINT    = 1;       // Midpoint Method (see Pixar Tutorial)
const SOLV_ADAMS_BASH  = 2;       // Adams-Bashforth Explicit Integrator
const SOLV_RUNGEKUTTA  = 3;       // Arbitrary degree, set by 'solvDegree'

// IMPLICIT methods:  BETTER!
//          ++Permits larger time-steps for stiff systems, but
//          --More complicated, slower, less intuitively obvious,
//          ++Errors tend to 'remove energy' (ghost friction; 'damping') that
//              aids stability even for large time-steps.
//          --requires root-finding (iterative: often no analytical soln exists)
const SOLV_OLDGOOD     = 4;      //  early accidental 'good-but-wrong' solver
const SOLV_BACK_EULER  = 5;      // 'Backwind' or Implicit Euler
const SOLV_BACK_MIDPT  = 6;      // 'Backwind' or Implicit Midpoint
const SOLV_BACK_ADBASH = 7;      // 'Backwind' or Implicit Adams-Bashforth

// SEMI-IMPLICIT METHODS: BEST?
//          --Permits larger time-steps for stiff systems,
//          ++Simpler, easier-to-understand than Implicit methods
//          ++Errors tend to 'remove energy) (ghost friction; 'damping') that
//              aids stability even for large time-steps.
//          ++ DOES NOT require the root-finding of implicit methods,
const SOLV_VERLET      = 8;       // Verlet semi-implicit integrator;
const SOLV_VEL_VERLET  = 9;       // 'Velocity-Verlet'semi-implicit integrator
const SOLV_LEAPFROG    = 10;      // 'Leapfrog' integrator
const SOLV_MAX         = 11;      // number of solver types available.

const NU_EPSILON  = 10E-15;         // a tiny amount; a minimum vector length
                                    // to use to avoid 'divide-by-zero'

// reusable vectors
var upVec = new Vector3([0, 0, 1]);
var outVec = new Vector3([0, 0, 0]);
//=============================================================================
//==============================================================================
function PartSys() {
//==============================================================================
//=============================================================================
// Constructor for a new particle system.
  this.randX = 0;   // random point chosen by call to roundRand()
  this.randY = 0;
  this.randZ = 0;
  this.isFountain = 1;  // Press 'f' or 'F' key to toggle; if 1, apply age 
                        // age constraint, which re-initializes particles whose
                        // lifetime falls to zero, forming a 'fountain' of
                        // freshly re-initialized bouncy-balls.
  this.forceList = [];            // (empty) array to hold CForcer objects
                                  // for use by ApplyAllForces().
                                  // NOTE: this.forceList.push("hello"); appends
                                  // string "Hello" as last element of forceList.
                                  // console.log(this.forceList[0]); prints hello.
  this.limitList = [];            // (empty) array to hold CLimit objects
                                  // for use by doContstraints()
}
// HELPER FUNCTIONS:
//=====================
// Misc functions that don't fit elsewhere

PartSys.prototype.roundRand = function() {
//==============================================================================
// When called, find a new 3D point (this.randX, this.randY, this.randZ) chosen 
// 'randomly' and 'uniformly' inside a sphere of radius 1.0 centered at origin.  
//		(within this sphere, all regions of equal volume are equally likely to
//		contain the the point (randX, randY, randZ, 1).

	do {			// RECALL: Math.random() gives #s with uniform PDF between 0 and 1.
		this.randX = 2.0*Math.random() -1.0; // choose an equally-likely 2D point
		this.randY = 2.0*Math.random() -1.0; // within the +/-1 cube, but
		this.randZ = 2.0*Math.random() -1.0;
		}       // is x,y,z outside sphere? try again!
	while(this.randX*this.randX + 
	      this.randY*this.randY + 
	      this.randZ*this.randZ >= 1.0); 
}

// INIT FUNCTIONS:
//==================
// Each 'init' function initializes everything in our particle system. Each 
// creates all necessary state variables, force-applying objects, 
// constraint-applying objects, solvers and all other values needed to prepare
// the particle-system to run without any further adjustments.

PartSys.prototype.initBouncy2D = function() {
//==============================================================================
  // Create all state-variables-------------------------------------------------

  this.gndVerts = 2;
  this.clothVerts = 10;
  this.fireVerts = 600;
  this.windVerts = 300;
  this.boidVerts = 100;

  this.partCount = this.gndVerts + this.clothVerts + this.fireVerts + this.windVerts + this.boidVerts;
  this.s1 =    new Float32Array(this.partCount * PART_MAXVAR);
  this.s2 =    new Float32Array(this.partCount * PART_MAXVAR);
  this.s3 =    new Float32Array(this.partCount * PART_MAXVAR);
  this.sM =    new Float32Array(this.partCount * PART_MAXVAR);
  this.s1dot = new Float32Array(this.partCount * PART_MAXVAR); 
  this.s2dot = new Float32Array(this.partCount * PART_MAXVAR);
  this.sMDot = new Float32Array(this.partCount * PART_MAXVAR);
        // NOTE: Float32Array objects are zero-filled by default.

  
  /*
  // Create & init all force-causing objects------------------------------------
  var fTmp = new CForcer();       // create a force-causing object, and
    // earth gravity for all particles:
    fTmp.forceType = F_GRAV_E;      // set it to earth gravity, and
    fTmp.targFirst = 2;             // set it to affect ALL particles:
    fTmp.partCount = this.clothVerts;            // (negative value means ALL particles)
                                    // (and IGNORE all other Cforcer members...)
  this.forceList.push(fTmp);      // append this 'gravity' force object to 
                                  // the forceList array of force-causing objects.
                                  
  // drag for all particles:
  fTmp = new CForcer();           // create a NEW CForcer object 
                                    // (WARNING! until we do this, fTmp refers to
                                    // the same memory locations as forceList[0]!!!) 
    fTmp.forceType = F_DRAG;        // Viscous Drag
    fTmp.Kdrag = 0.15;              // in Euler solver, scales velocity by 0.85
    fTmp.targFirst = 2;             // apply it to ALL particles:
    fTmp.partCount = this.clothVerts;            // (negative value means ALL particles)
                                    // (and IGNORE all other Cforcer members...)
  this.forceList.push(fTmp);      // append this 'gravity' force object to 
                                  // the forceList array of force-causing objects.
  */
  /*
  // spring:
  var fTmp = new CForcer();       // create a force-causing object, and
    fTmp.forceType = F_SPRING;      // set it to spring, and
    fTmp.targFirst = 0;             
    fTmp.partCount = 0;      
    // F_SPRING Single Spring variables;........................................
    fTmp.e1 = 0;               // Spring endpoints connect particle # e1 to # e2
    fTmp.e2 = 1;               // (state vars hold particles 0,1,2,3,...partCount)
    fTmp.K_spring = 0.5;             // Spring constant: force = stretchDistance*K_s
    fTmp.K_springDamp = 0.02;         // Spring damping: (friction within the spring);
                                // force = -relVel*K_damp; 'relative velocity' is
                                // how fast the spring length is changing, and
                                // applied along the direction of the spring.
    fTmp.K_restLength = 1.0;         // the zero-force length of this spring.   
  this.forceList.push(fTmp);
  */
  // Report:
  console.log("PartSys.initBouncy2D() created PartSys.forceList[] array of ");
  console.log("\t\t", this.forceList.length, "CForcer objects:");
  for(i=0; i<this.forceList.length; i++) {
    console.log("CForceList[",i,"]");
    this.forceList[i].printMe();
    }  
    
    /*
  // Create & init all constraint-causing objects-------------------------------
  var cTmp = new CLimit();      // creat constraint-causing object, and
  cTmp.hitType = HIT_BOUNCE_VEL;  // set how particles 'bounce' from its surface,
  cTmp.limitType = LIM_VOL;       // confine particles inside axis-aligned 
                                  // rectangular volume that
  cTmp.targFirst = 0;             // applies to ALL particles; starting at 0 
  cTmp.partCount = -1;            // through all the rest of them.
  cTmp.xMin = -1.0; cTmp.xMax = 1.0;  // box extent:  +/- 1.0 box at origin
  cTmp.yMin = -1.0; cTmp.yMax = 1.0;
  cTmp.zMin = -1.0; cTmp.zMax = 1.0;
  cTmp.Kresti = 1.0;              // bouncyness: coeff. of restitution.
                                  // (and IGNORE all other CLimit members...)
  this.limitList.push(cTmp);      // append this 'box' constraint object to the
                                  // 'limitList' array of constraint-causing objects. 
                    */
  // Create & init all constraint-causing objects-------------------------------
  var cTmp = new CLimit();      // creat constraint-causing object, and
  cTmp.hitType = HIT_STOP;  // set how particles 'bounce' from its surface,
  cTmp.limitType = LIM_VOL;       // confine particles inside axis-aligned 
                                  // rectangular volume that
  cTmp.targFirst = 2;             // applies to ALL particles; starting at 0 
  cTmp.partCount = this.clothVerts;            // through all the rest of them.
  cTmp.xMin = -5.0; cTmp.xMax = 5.0;  // box extent:  +/- 1.0 box at origin
  cTmp.yMin = -5.0; cTmp.yMax = 5.0;
  cTmp.zMin =  0.0; cTmp.zMax = 5.0;
  cTmp.Kresti = 1.0;              // bouncyness: coeff. of restitution.
                                  // (and IGNORE all other CLimit members...)
  this.limitList.push(cTmp);      // append this 'box' constraint object to the
                                  // 'limitList' array of constraint-causing objects. 

  // Report:
  console.log("PartSys.initBouncy2D() created PartSys.limitList[] array of ");
  console.log("\t\t", this.limitList.length, "CLimit objects.");

  this.INIT_VEL =  0.15 * 60.0;		// initial velocity in meters/sec.
	                  // adjust by ++Start, --Start buttons. Original value 
										// was 0.15 meters per timestep; multiply by 60 to get
                    // meters per second.
  this.drag = 0.985;// units-free air-drag (scales velocity); adjust by d/D keys
  this.grav = 9.832;// gravity's acceleration(meter/sec^2); adjust by g/G keys.
	                  // on Earth surface, value is 9.832 meters/sec^2.
  this.resti = 1.0; // units-free 'Coefficient of Restitution' for 
	                  // inelastic collisions.  Sets the fraction of momentum 
										// (0.0 <= resti < 1.0) that remains after a ball 
										// 'bounces' on a wall or floor, as computed using 
										// velocity perpendicular to the surface. 
										// (Recall: momentum==mass*velocity.  If ball mass does 
										// not change, and the ball bounces off the x==0 wall,
										// its x velocity xvel will change to -xvel * resti ).
										
  //--------------------------init Particle System Controls:
  this.runMode =  3;// Master Control: 0=reset; 1= pause; 2=step; 3=run
  this.solvType = SOLV_EULER;// adjust by s/S keys.
                    // SOLV_EULER (explicit, forward-time, as 
										// found in BouncyBall03.01BAD and BouncyBall04.01badMKS)
										// SOLV_OLDGOOD for special-case implicit solver, reverse-time, 
										// as found in BouncyBall03.GOOD, BouncyBall04.goodMKS)
  this.bounceType = 1;	// floor-bounce constraint type:
										// ==0 for velocity-reversal, as in all previous versions
										// ==1 for Chapter 3's collision resolution method, which
										// uses an 'impulse' to cancel any velocity boost caused
										// by falling below the floor.
										
//--------------------------------Create & fill VBO with state var s1 contents:
// INITIALIZE s1, s2:
//  NOTE: s1,s2 are a Float32Array objects, zero-filled by default.
// That's OK for most particle parameters, but these need non-zero defaults:

  j = 0;
  this.s1[j + PART_XPOS] = -1.0; 
  this.s1[j + PART_YPOS] =  0.0;  
  this.s1[j + PART_ZPOS] =  0.0;
  this.s1[j + PART_WPOS] =  1.0;    
  this.s1[j + PART_R] = 0.0;
  this.s1[j + PART_G] = 0.0;
  this.s1[j + PART_B] = 0.0;
  j += PART_MAXVAR;
  this.s1[j + PART_XPOS] =  1.0; 
  this.s1[j + PART_YPOS] =  0.0;  
  this.s1[j + PART_ZPOS] =  0.0;
  this.s1[j + PART_WPOS] =  1.0;   
  this.s1[j + PART_R] = 0.0;
  this.s1[j + PART_G] = 0.0;
  this.s1[j + PART_B] = 0.0;  
  this.s2.set(this.s1);

this.initSpringCloth();
this.initFireReeves();
this.initWind();
this.initBoids();


  this.FSIZE = this.s1.BYTES_PER_ELEMENT;  // 'float' size, in bytes.
// Create a vertex buffer object (VBO) in the graphics hardware: get its ID# 
  this.vboID = gl.createBuffer();
  if (!this.vboID) {
    console.log('PartSys.init() Failed to create the VBO object in the GPU');
    return -1;
  }
  // "Bind the new buffer object (memory in the graphics system) to target"
  // In other words, specify the usage of one selected buffer object.
  // What's a "Target"? it's the poorly-chosen OpenGL/WebGL name for the 
  // intended use of this buffer's memory; so far, we have just two choices:
  //	== "gl.ARRAY_BUFFER" meaning the buffer object holds actual values we 
  //      need for rendering (positions, colors, normals, etc), or 
  //	== "gl.ELEMENT_ARRAY_BUFFER" meaning the buffer object holds indices 
  // 			into a list of values we need; indices such as object #s, face #s, 
  //			edge vertex #s.
  gl.bindBuffer(gl.ARRAY_BUFFER, this.vboID);

  // Write data from our JavaScript array to graphics systems' buffer object:
  gl.bufferData(gl.ARRAY_BUFFER, this.s1, gl.DYNAMIC_DRAW);
  // why 'DYNAMIC_DRAW'? Because we change VBO's content with bufferSubData() later

  // ---------Set up all attributes for VBO contents:
  //Get the ID# for the a_Position variable in the graphics hardware
  this.a_PositionID = gl.getAttribLocation(gl.program, 'a_Position');
  if(this.a_PositionID < 0) {
    console.log('PartSys.init() Failed to get the storage location of a_Position');
    return -1;
  }
   //Get the ID# for the a_Color variable in the graphics hardware
  this.a_ColorID = gl.getAttribLocation(gl.program, 'a_Color');
  if(this.a_ColorID < 0) {
     console.log('PartSys.init() Failed to get the storage location of a_Color');
     return -1;
  }
  //Get the ID# for the a_Color variable in the graphics hardware
  this.a_DiamID = gl.getAttribLocation(gl.program, 'a_Diam');
  if(this.a_DiamID < 0) {
    console.log('PartSys.init() Failed to get the storage location of a_Diam');
    return -1;
  }
  // Tell GLSL to fill the 'a_Position' attribute variable for each shader with
  // values from the buffer object chosen by 'gl.bindBuffer()' command.
  // websearch yields OpenGL version: 
  //		http://www.opengl.org/sdk/docs/man/xhtml/glVertexAttribPointer.xml
  gl.vertexAttribPointer(this.a_PositionID, 
          4,  // # of values in this attrib (1,2,3,4) 
          gl.FLOAT, // data type (usually gl.FLOAT)
          false,    // use integer normalizing? (usually false)
          PART_MAXVAR*this.FSIZE,  // Stride: #bytes from 1st stored value to next one
          PART_XPOS * this.FSIZE); // Offset; #bytes from start of buffer to 
                    // 1st stored attrib value we will actually use.
  // Enable this assignment of the bound buffer to the a_Position variable:
  gl.enableVertexAttribArray(this.a_PositionID);

  // a_Color attribute
  gl.vertexAttribPointer(this.a_ColorID, 
    3,  // # of values in this attrib (1,2,3,4) 
    gl.FLOAT, // data type (usually gl.FLOAT)
    false,    // use integer normalizing? (usually false)
    PART_MAXVAR*this.FSIZE,  // Stride: #bytes from 1st stored value to next one
    PART_R * this.FSIZE); // Offset; #bytes from start of buffer to 
              // 1st stored attrib value we will actually use.
  // Enable this assignment of the bound buffer to the a_Color variable:
  gl.enableVertexAttribArray(this.a_ColorID);
 
  // a_Diam attribute
  gl.vertexAttribPointer(this.a_DiamID, 
    1,  // # of values in this attrib (1,2,3,4) 
    gl.FLOAT, // data type (usually gl.FLOAT)
    false,    // use integer normalizing? (usually false)
    PART_MAXVAR*this.FSIZE,  // Stride: #bytes from 1st stored value to next one
    PART_DIAM * this.FSIZE); // Offset; #bytes from start of buffer to 
              // 1st stored attrib value we will actually use.
  // Enable this assignment of the bound buffer to the a_Diam variable:
  gl.enableVertexAttribArray(this.a_DiamID);

  // ---------Set up all uniforms we send to the GPU:
  // Get graphics system storage location of each uniform our shaders use:
  // (why? see  http://www.opengl.org/wiki/Uniform_(GLSL) )
  this.u_runModeID = gl.getUniformLocation(gl.program, 'u_runMode');
  if(!this.u_runModeID) {
  	console.log('PartSys.init() Failed to get u_runMode variable location');
  	return;
  }
  // Set the initial values of all uniforms on GPU: (runMode set by keyboard)
	gl.uniform1i(this.u_runModeID, this.runMode);
}

PartSys.prototype.initFireReeves = function() {
//==============================================================================
  j = (this.gndVerts + this.clothVerts) * PART_MAXVAR;

//----------init verts---------------
  k = 0;
  for(var i = 0; i < this.fireVerts; i += 1, j+= PART_MAXVAR) {
    this.s1[j + PART_XPOS] =  (Math.random() - 0.5); 
    this.s1[j + PART_YPOS] =  (Math.random() - 0.5);  
    this.s1[j + PART_ZPOS] =  (Math.random() * 0.5);
    this.s1[j + PART_WPOS] =  1.0;    
    this.s1[j + PART_XVEL] =  (Math.random() - 0.5) * 0.1;
    this.s1[j + PART_YVEL] =  (Math.random() - 0.5) * 0.1;
    this.s1[j + PART_ZVEL] =  Math.random() * 0.5;
    this.s1[j + PART_R] = 1.0;
    this.s1[j + PART_G] = 0.5;
    this.s1[j + PART_B] = 0.5;
    this.s1[j + PART_MASS] =  1.0;    
    this.s1[j + PART_DIAM] =  0.7; 
    this.s1[j + PART_RENDMODE] = 0.0;
    //----------------------------
    this.s2.set(this.s1);
  }

  start = this.gndVerts + this.clothVerts;
  //----------fire constraints---------------
    var cTmp = new CLimit();      // creat constraint-causing object, and
    cTmp.hitType = HIT_STOP;  // set how particles 'bounce' from its surface,
    cTmp.limitType = LIM_VOL;       // confine particles inside axis-aligned 
                                    // rectangular volume that
    cTmp.targFirst = start;             // applies to ALL particles; starting at 0 
    cTmp.partCount = this.fireVerts;            // through all the rest of them.
    cTmp.xMin = -0.5; cTmp.xMax = 0.5;  // box extent:  +/- 1.0 box at origin
    cTmp.yMin = -0.5; cTmp.yMax = 0.5;
    cTmp.zMin =  0.0; cTmp.zMax =  10;
    cTmp.Kresti = 1.0;              // bouncyness: coeff. of restitution.
                                    // (and IGNORE all other CLimit members...)
    this.limitList.push(cTmp);      // append this 'box' constraint object to the
                                    // 'limitList' array of constraint-causing objects. 
  
}

PartSys.prototype.initBoids = function() { 

  colors = [[0.85, 0.20, 0.55],
            [0.70, 0.20, 0.70],
            [0.35, 0.20, 0.85]];

  

  j = (this.gndVerts + this.clothVerts + this.fireVerts + this.windVerts) * PART_MAXVAR;
  //----------init boid verts---------------
  for(var i = 0; i < this.boidVerts; i += 1, j+= PART_MAXVAR) {
    this.s1[j + PART_XPOS] =  Math.random() - 0.5; 
    this.s1[j + PART_YPOS] =  Math.random() - 0.5;  
    this.s1[j + PART_ZPOS] =  Math.random();
    this.s1[j + PART_WPOS] =  1.0;    
    this.s1[j + PART_XVEL] =  0//(Math.random() - 0.5) * 0.1;
    this.s1[j + PART_YVEL] =  0//(Math.random() - 0.5) * 0.1;
    this.s1[j + PART_ZVEL] =  0 //(Math.random() - 0.5) * 0.1;
    n = Math.floor(Math.random() * 3)
    this.s1[j + PART_R] = colors[n][0];
    this.s1[j + PART_G] = colors[n][1];
    this.s1[j + PART_B] = colors[n][2];
    this.s1[j + PART_MASS] =  1.0;    
    this.s1[j + PART_DIAM] =  0.5; 
    this.s1[j + PART_RENDMODE] = 0.0;
    this.s2[j + PART_AGE] = 0;
    //----------------------------
    this.s2.set(this.s1);
  }

  //------------init boid force-----------------
  fTmp = new CForcer();      
  fTmp.forceType = F_BUBBLE;    
  fTmp.targFirst = this.gndVerts + this.clothVerts + this.fireVerts + this.windVerts;             
  fTmp.partCount = this.boidVerts;       
  fTmp.separation = 0.2;
  fTmp.cohesion = 0.5;  
  this.forceList.push(fTmp);  

  start = this.gndVerts + this.clothVerts + this.fireVerts + this.windVerts;
  //----------boid constraints---------------
  var cTmp = new CLimit();      // creat constraint-causing object, and
  cTmp.hitType = HIT_BOUNCE_VEL;  // set how particles 'bounce' from its surface,
  cTmp.limitType = LIM_VOL;       // confine particles inside axis-aligned 
                                  // rectangular volume that
  cTmp.targFirst = start;             // applies to ALL particles; starting at 0 
  cTmp.partCount = this.boidVerts;            // through all the rest of them.
  cTmp.xMin = -20; cTmp.xMax = 20;  // box extent:  +/- 1.0 box at origin
  cTmp.yMin = -20; cTmp.yMax = 20;
  cTmp.zMin =  0.0; cTmp.zMax =  10;
  cTmp.Kresti = 1.0;              // bouncyness: coeff. of restitution.
                                  // (and IGNORE all other CLimit members...)
  this.limitList.push(cTmp);      // append this 'box' constraint object to the
                                  // 'limitList' array of constraint-causing objects. 
}

PartSys.prototype.initWind = function() { 
//==============================================================================
  j = (this.gndVerts + this.clothVerts + this.fireVerts) * PART_MAXVAR;

//----------init verts---------------
  for(var i = 0; i < this.windVerts; i += 1, j+= PART_MAXVAR) {
    this.s1[j + PART_XPOS] =  (Math.random() - 0.5) * 0.5; 
    this.s1[j + PART_YPOS] =  (Math.random() - 0.5) * 0.5;  
    this.s1[j + PART_ZPOS] =   Math.random();
    this.s1[j + PART_WPOS] =  1.0;    
    this.s1[j + PART_XVEL] =  0;
    this.s1[j + PART_YVEL] =  0;
    this.s1[j + PART_ZVEL] =  0.4;
    var grey = Math.random() * 0.1;
    this.s1[j + PART_R] = 0.6 + grey;
    this.s1[j + PART_G] = 0.6 + grey;
    this.s1[j + PART_B] = 0.6 + grey;
    this.s1[j + PART_MASS] =  1.0;    
    this.s1[j + PART_DIAM] =  1.0; 
    this.s1[j + PART_RENDMODE] = 0.0;
    this.s2[j + PART_AGE] = 0;
    //----------------------------
    this.s2.set(this.s1);

  }

  start = this.gndVerts + this.clothVerts + this.fireVerts;
  //----------wind constraints---------------
  var cTmp = new CLimit();      // creat constraint-causing object, and
  cTmp.hitType = HIT_STOP;  // set how particles 'bounce' from its surface,
  cTmp.limitType = LIM_VOL;       // confine particles inside axis-aligned 
                                  // rectangular volume that
  cTmp.targFirst = start;             // applies to ALL particles; starting at 0 
  cTmp.partCount = this.windVerts;            // through all the rest of them.
  cTmp.xMin = -0.7; cTmp.xMax = 0.7;  // box extent:  +/- 1.0 box at origin
  cTmp.yMin = -0.7; cTmp.yMax = 0.7;
  cTmp.zMin =  0.0; cTmp.zMax =  10;
  cTmp.Kresti = 1.0;              // bouncyness: coeff. of restitution.
                                  // (and IGNORE all other CLimit members...)
  this.limitList.push(cTmp);      // append this 'box' constraint object to the
                                  // 'limitList' array of constraint-causing objects. 

                                  
  //------------init wind force-----------------
  fTmp = new CForcer();      
  fTmp.forceType = F_WIND;    
  fTmp.targFirst = this.gndVerts + this.clothVerts + this.fireVerts;             
  fTmp.partCount = this.windVerts;         
  this.forceList.push(fTmp);    
   
  //------------init gravity--------------------
  fTmp = new CForcer();      
  fTmp.forceType = F_GRAV_E;    
  fTmp.targFirst = this.gndVerts + this.clothVerts + this.fireVerts;             
  fTmp.partCount = this.windVerts;         
  this.forceList.push(fTmp); 
  
  //------------init drag-----------------------
  fTmp = new CForcer();    
  // drag for all particles:       
  fTmp.forceType = F_DRAG;       
  fTmp.Kdrag = 0.25;            
  fTmp.targFirst = this.gndVerts + this.clothVerts + this.fireVerts;            
  fTmp.partCount = this.windVerts;          
                                    
  this.forceList.push(fTmp);  
}
PartSys.prototype.initFlocking = function(count) { 
//==============================================================================
  console.log('PartSys.initFlocking() stub not finished!');
}
PartSys.prototype.initSpringPair = function() { 
//==============================================================================
  console.log('PartSys.initSpringPair() stub not finished!');
}
PartSys.prototype.initSpringRope = function(count) { 
//==============================================================================
  console.log('PartSys.initSpringRope() stub not finished!');
}
PartSys.prototype.initSpringCloth = function() {
//==============================================================================

  clothLen = 4;
  clothStep = clothLen / (this.clothVerts - 1);

  // iterator for s1
  j = this.gndVerts * PART_MAXVAR;
  // iterator for clothVerts
  for(var i = 0; i < this.clothVerts; i += 1, j+= PART_MAXVAR) {
    this.s1[j + PART_XPOS] =  i * clothStep - (clothLen / 2); 
    this.s1[j + PART_YPOS] =  0;  
    this.s1[j + PART_ZPOS] =  1.5 + this.s1[j + PART_XPOS]*this.s1[j + PART_XPOS] * 0.1;
    this.s1[j + PART_WPOS] =  1.0;    
    this.s1[j + PART_XVEL] =  0.0;
    this.s1[j + PART_YVEL] =  0.0;
    this.s1[j + PART_ZVEL] =  0.0;
    this.s1[j + PART_R] = 1.0;
    this.s1[j + PART_G] = 1.0;
    this.s1[j + PART_B] = 1.0;
    this.s1[j + PART_MASS] =  0.1;    
    this.s1[j + PART_DIAM] =  1.0; 
    this.s1[j + PART_RENDMODE] = 0.0;
    //----------------------------
    this.s2.set(this.s1);
  }

   //----------cloth constraints---------------
    j = this.gndVerts * PART_MAXVAR;

    xLim = this.s1[j + PART_XPOS];
    yLim = this.s1[j + PART_YPOS];
    zLim = this.s1[j + PART_ZPOS];
    var cTmp = new CLimit();      // creat constraint-causing object, and
    cTmp.hitType = HIT_STOP;  // set how particles 'bounce' from its surface,
    cTmp.limitType = LIM_VOL;       // confine particles inside axis-aligned 
                                    // rectangular volume that
    cTmp.targFirst = this.gndVerts; // applies to ALL particles; starting at 0 
    cTmp.partCount = 1;            // through all the rest of them.
    cTmp.xMin = xLim; cTmp.xMax = xLim;  // box extent:  +/- 1.0 box at origin
    cTmp.yMin = yLim; cTmp.yMax = yLim;
    cTmp.zMin = zLim; cTmp.zMax = zLim;
    cTmp.Kresti = 1.0;              // bouncyness: coeff. of restitution.
                                    // (and IGNORE all other CLimit members...)
    this.limitList.push(cTmp);      // append this 'box' constraint object to the
                                    // 'limitList' array of constraint-causing objects. 
  //----------cloth constraints---------------
    j = (this.gndVerts + this.clothVerts - 1) * PART_MAXVAR;

    xLim = this.s1[j + PART_XPOS];
    yLim = this.s1[j + PART_YPOS];
    zLim = this.s1[j + PART_ZPOS];
    var cTmp = new CLimit();      // creat constraint-causing object, and
    cTmp.hitType = HIT_STOP;  // set how particles 'bounce' from its surface,
    cTmp.limitType = LIM_VOL;       // confine particles inside axis-aligned 
                                    // rectangular volume that
    cTmp.targFirst = this.gndVerts + this.clothVerts - 1; // applies to ALL particles; starting at 0 
    cTmp.partCount = 1;            // through all the rest of them.
    cTmp.xMin = xLim; cTmp.xMax = xLim;  // box extent:  +/- 1.0 box at origin
    cTmp.yMin = yLim; cTmp.yMax = yLim;
    cTmp.zMin = zLim; cTmp.zMax = zLim;
    cTmp.Kresti = 1.0;              // bouncyness: coeff. of restitution.
                                    // (and IGNORE all other CLimit members...)
    this.limitList.push(cTmp);      // append this 'box' constraint object to the
                                    // 'limitList' array of constraint-causing objects. 
                          
                                    
  //------------init spring force-----------------
  for (var i = this.gndVerts; i < this.gndVerts + this.clothVerts - 1; i += 1) {
    var fTmp = new CForcer();       // create a force-causing object, and

    fTmp.forceType = F_SPRING;      // set it to spring, and
    fTmp.targFirst = 0;             // particle-number of the first particle affected by this CForcer;          
    fTmp.partCount = 0;             // For springs, set targCount=0 & use e1,e2 below.
    fTmp.e1 = i;               // Spring endpoints connect particle # e1 to # e2
    fTmp.e2 = i + 1; 
          
    fTmp.K_spring = 15;             // Spring constant: force = stretchDistance*K_s
    fTmp.K_springDamp = 1;         // Spring damping: (friction within the spring);
    fTmp.K_restLength = 0.5 * clothLen / (this.clothVerts - 1);         // the zero-force length of this spring.   

    this.forceList.push(fTmp);
  }

  
  //------------init gravity force-----------------
  fTmp = new CForcer();      
  // earth gravity for all particles:
  fTmp.forceType = F_GRAV_E;    
  fTmp.targFirst = this.gndVerts;             
  fTmp.partCount = this.clothVerts;         
  this.forceList.push(fTmp);    
                                               
  fTmp = new CForcer();    
  // drag for all particles:       
  fTmp.forceType = F_DRAG;       
  fTmp.Kdrag = 0.25;            
  fTmp.targFirst = this.gndVerts;            
  fTmp.partCount = this.clothVerts;          
                                    
  this.forceList.push(fTmp);    
  
}
PartSys.prototype.initSpringSolid = function() {
//==============================================================================
  console.log('PartSys.initSpringSolid() stub not finished!');
}
PartSys.prototype.initOrbits = function() {
//==============================================================================
  console.log('PartSys.initOrbits() stub not finished!');
}

PartSys.prototype.applyForces = function(s, fList) { 
//==============================================================================
// Clear the force-accumulator vector for each particle in state-vector 's', 
// then apply each force described in the collection of force-applying objects 
// found in 'fSet'.
// (this function will simplify our too-complicated 'draw()' function)

  // To begin, CLEAR force-accumulators for all particles in state variable 's'
  var j = 0;  // i==particle number; j==array index for i-th particle
  for(var i = 0; i < this.partCount; i += 1, j+= PART_MAXVAR) {
    s[j + PART_X_FTOT] = 0.0;
    s[j + PART_Y_FTOT] = 0.0;
    s[j + PART_Z_FTOT] = 0.0;
  }
  // then find and accumulate all forces applied to particles in state s:
  for(var k = 0; k < fList.length; k++) {  // for every CForcer in fList array,
//    console.log("fList[k].forceType:", fList[k].forceType);
    if(fList[k].forceType <=0) {     //.................Invalid force? SKIP IT!
                        // if forceType is F_NONE, or if forceType was 
      continue;         // negated to (temporarily) disable the CForcer,
      }               
    // ..................................Set up loop for all targeted particles
    // HOW THIS WORKS:
    // Most, but not all CForcer objects apply a force to many particles, and
    // the CForcer members 'targFirst' and 'targCount' tell us which ones:
    // *IF* targCount == 0, the CForcer applies ONLY to particle numbers e1,e2
    //          (e.g. the e1 particle begins at s[fList[k].e1 * PART_MAXVAR])
    // *IF* targCount < 0, apply the CForcer to 'targFirst' and all the rest
    //      of the particles that follow it in the state variable s.
    // *IF* targCount > 0, apply the CForcer to exactly 'targCount' particles,
    //      starting with particle number 'targFirst'
    // Begin by presuming targCount < 0;
    var m = fList[k].targFirst;   // first affected particle # in our state 's'
    var mmax = fList[k].targFirst + fList[k].partCount;    // Total number of particles in 's'
                                  // (last particle number we access is mmax-1)
                              
    if(fList[k].targCount==0){    // ! Apply force to e1,e2 particles only!
      m=mmax=0;   // don't let loop run; apply force to e1,e2 particles only.
      }
    else if(fList[k].targCount > 0) {   // ?did CForcer say HOW MANY particles?
      // YES! force applies to 'targCount' particles starting with particle # m:
      var tmp = fList[k].targCount;
      if(tmp < mmax) mmax = tmp;    // (but MAKE SURE mmax doesn't get larger)
      else console.log("\n\n!!PartSys.applyForces() index error!!\n\n");
      }
      //console.log("m:",m,"mmax:",mmax);
      // m and mmax are now correctly initialized; use them!  
    //......................................Apply force specified by forceType 
    switch(fList[k].forceType) {    // what kind of force should we apply?
      case F_MOUSE:     // Spring-like connection to mouse cursor
        console.log("PartSys.applyForces(), fList[",k,"].forceType:", 
                                  fList[k].forceType, "NOT YET IMPLEMENTED!!");
        break;
      case F_GRAV_E:    // Earth-gravity pulls 'downwards' as defined by downDir
        var j = m*PART_MAXVAR;  // state var array index for particle # m
        for(; m<mmax; m++, j+=PART_MAXVAR) { // for every part# from m to mmax-1,
          //console.log("applying to part: ", m);
                      // force from gravity == mass * gravConst * downDirection
          s[j + PART_X_FTOT] += s[j + PART_MASS] * fList[k].gravConst * 
                                                   fList[k].downDir.elements[0];
          s[j + PART_Y_FTOT] += s[j + PART_MASS] * fList[k].gravConst * 
                                                   fList[k].downDir.elements[1];
          s[j + PART_Z_FTOT] += s[j + PART_MASS] * fList[k].gravConst * 
                                                   fList[k].downDir.elements[2];
          }
        break;
      case F_GRAV_P:    // planetary gravity between particle # e1 and e2.
        console.log("PartSys.applyForces(), fList[",k,"].forceType:", 
                                  fList[k].forceType, "NOT YET IMPLEMENTED!!");
       break;
      case F_WIND:      // Blowing-wind-like force-field; fcn of 3D position
        
      
      var source = [0, 0, 0];

        var j = m*PART_MAXVAR;  // state var array index for particle # m
        for(; m<mmax; m++, j+=PART_MAXVAR) {
      
          outVec.elements[0] = s[j + PART_XPOS] - source[0]
          outVec.elements[1] = s[j + PART_YPOS] - source[1]
          outVec.elements[2] = s[j + PART_ZPOS] - source[2]

          var forceVec = outVec.cross(upVec)

          xpos = s[j + PART_XPOS];
          ypos = s[j + PART_YPOS];
          zpos = s[j + PART_ZPOS];

          dist = Math.sqrt(xpos*xpos + ypos*ypos + zpos*zpos);
          
          // outward force
          s[j + PART_X_FTOT] += forceVec.elements[0] * 14 - dist * 2;
          s[j + PART_Y_FTOT] += forceVec.elements[1] * 14 - dist * 2;
          //s[j + PART_Z_FTOT] += forceVec.elements[2];
          
          // drag into source
          s[j + PART_X_FTOT] -= outVec.elements[0] * 50;
          s[j + PART_Y_FTOT] -= outVec.elements[1] * 50;
          //s[j + PART_Z_FTOT] -= outVec.elements[2] * 0.5;

          s[j + PART_X_FTOT] -= s[j + PART_XVEL]; 
          s[j + PART_Y_FTOT] -= s[j + PART_YVEL];

        }
        
        break;
      // USING F_BUBBLE FOR BOID FORCES
      case F_BUBBLE:    // Constant inward force (bub_force)to a 3D centerpoint 
                        // bub_ctr if particle is > bub_radius away from it.     

        var j1 = m*PART_MAXVAR;
        var m1 = m;

        for(; m1<mmax; m1++, j1+=PART_MAXVAR) {

          x1 = s[j1 + PART_XPOS]
          y1 = s[j1 + PART_YPOS]
          z1 = s[j1 + PART_ZPOS]
          
          //-----------------boid separation--------------------
          var j2 = m*PART_MAXVAR;
          for (var m2 = m; m2 <mmax; m2++, j2 += PART_MAXVAR) {
            // skip comparing boid against itself
            if (m1 == m2) {
              continue;
            }

            x2 = s[j2 + PART_XPOS]
            y2 = s[j2 + PART_YPOS]
            z2 = s[j2 + PART_ZPOS]

            // vector from boid 1 to boid 2
            outVec.elements[0] = x2 - x1;
            outVec.elements[1] = y2 - y1;
            outVec.elements[2] = z2 - z1;

            // dist from boid 1 to boid 2
            dist = Math.sqrt((x2-x1)*(x2-x1) + (y2-y1)*(y2-y1) + (z2-z1)*(z2-z1))
 
            if (dist < fList[k].separation) {
              // mag = percent of total separation
              mag = 1 - dist / fList[k].separation
              
              // add force proportional to distance
              s[j1 + PART_X_FTOT] -= outVec.elements[0] * mag; 
              s[j1 + PART_Y_FTOT] -= outVec.elements[1] * mag;
              s[j1 + PART_Z_FTOT] -= outVec.elements[2] * mag; 
              // add drag (subtract velocity) proportional to distance
              s[j1 + PART_X_FTOT] -= s[j1 + PART_XVEL] * mag; 
              s[j1 + PART_Y_FTOT] -= s[j1 + PART_YVEL] * mag;
              s[j1 + PART_Z_FTOT] -= s[j1 + PART_ZVEL] * mag;
            }
          }
          
          x2 = fList[k].ctr.elements[0]
          y2 = fList[k].ctr.elements[1]
          z2 = fList[k].ctr.elements[2]
        
          //-----------------boid cohesion--------------------
          dist = Math.sqrt((x2-x1)*(x2-x1) + (y2-y1)*(y2-y1) + (z2-z1)*(z2-z1))
          if (dist > fList[k].cohesion) {
            // (1 - cohesion / dist) -> force toward max radius, not center
            s[j1 + PART_X_FTOT] += (x2-x1) * (1 - fList[k].cohesion / dist); 
            s[j1 + PART_Y_FTOT] += (y2-y1) * (1 - fList[k].cohesion / dist);
            s[j1 + PART_Z_FTOT] += (z2-z1) * (1 - fList[k].cohesion / dist);
            // add drag (subtract velocity)
            //s[j1 + PART_X_FTOT] -= s[j1 + PART_XVEL]; 
            //s[j1 + PART_Y_FTOT] -= s[j1 + PART_YVEL];
            //s[j1 + PART_Z_FTOT] -= s[j1 + PART_ZVEL];
          } 
        }
        
       break;
      case F_DRAG:      // viscous drag: force = -K_drag * velocity.
        var j = m*PART_MAXVAR;  // state var array index for particle # m
        for(; m<mmax; m++, j+=PART_MAXVAR) { // for every particle# from m to mmax-1,
                      // force from gravity == mass * gravConst * downDirection
          s[j + PART_X_FTOT] -= fList[k].K_drag * s[j + PART_XVEL]; 
          s[j + PART_Y_FTOT] -= fList[k].K_drag * s[j + PART_YVEL];
          s[j + PART_Z_FTOT] -= fList[k].K_drag * s[j + PART_ZVEL];
          }
        break;
      case F_SPRING:
        // ties together 2 particles; distance sets force
            e0loc = fList[k].e1 * PART_MAXVAR;
            e1loc = fList[k].e2 * PART_MAXVAR;

            // e0to1== vector from spring end e0 to spring end e1;
            // (e0,e1 are the indices of the CPart objects connected by spring)
            e0to1 = [0, 0, 0];

            e0to1[0] = s[e1loc + PART_XPOS] -
                       s[e0loc + PART_XPOS];
            e0to1[1] = s[e1loc + PART_YPOS] -
                       s[e0loc + PART_YPOS];
            e0to1[2] = s[e1loc + PART_ZPOS] -
                       s[e0loc + PART_ZPOS];
            dist2 = e0to1[0]*e0to1[0] + e0to1[1]*e0to1[1] + e0to1[2]*e0to1[2];
 
            // distance squared,
            normer = Math.sqrt(dist2);       // distance.
            e0to1[0] /= normer + NU_EPSILON;  // find unit vector from e0 to e1.
            e0to1[1] /= normer + NU_EPSILON;  // (NU_EPSILON: no divide-by-zero)
            e0to1[2] /= normer + NU_EPSILON;
            stretch = normer - fList[k].K_restLength; // stretched spring: >0
            // spring force's magnitude: scaler*K_spring
            mag = stretch * fList[k].K_spring;
            
            // Use unit vector(xtmp,ytmp,ztmp) to specify direction; scale it
            // by 'mag' to find the force the spring adds to particle e0:
            s[e0loc + PART_X_FTOT] += mag * e0to1[0];
            s[e0loc + PART_Y_FTOT] += mag * e0to1[1];
            s[e0loc + PART_Z_FTOT] += mag * e0to1[2];
            // equal and opposite force on particle e1.
            s[e1loc + PART_X_FTOT] -= mag * e0to1[0];
            s[e1loc + PART_Y_FTOT] -= mag * e0to1[1];
            s[e1loc + PART_Z_FTOT] -= mag * e0to1[2];
            
            //---------------------------SPRING DAMPING------------------------
            // Real springs have 'damping' -- internal friction forces that
            // resist spring length-change, proportional to length_velocity.
            // How do we find rate-of-change of length?
            // a)-Find the difference in endpoint velocities: (e0.vel - e1.vel)
            // gives net velocity of e0 measured from e1, as if e1 was fixed.
            // --Find how much net velocity is along the spring's length;
            //  (why discard the velocity vector component perpendicular to the
            //   spring? because those SPIN the spring without length change).
            //      --dot-product of net velocity & e0to1 vector (unit length)
            //          gives velocity magnitude in e0to1 direction;
            //          for e0, mag = e0to1 dot (e0.vel - e1.vel)
            // --Damping force OPPOSES velocity, and is proportional to it:
            //      --for e0 endpoint, damping_force = -mag*K_spring*e0to1;
            // find net velocity............................
            xtmp = s[e0loc + PART_XVEL] -
                   s[e1loc + PART_XVEL];
            ytmp = s[e0loc + PART_YVEL] -
                   s[e1loc + PART_YVEL];
            ztmp = s[e0loc + PART_ZVEL] -
                   s[e1loc + PART_ZVEL];
            // find dot-product of net velocity with e0to1 unit vector:
            mag = xtmp * e0to1[0] +
                  ytmp * e0to1[1] +
                  ztmp * e0to1[2];
            // find magnitude of damping force: mpy by K_damp damping factor:
            mag *= fList[k].K_springDamp;
            
            // Apply force to e0; pushes in OPPOSITE direction as velocity;
            s[e0loc + PART_X_FTOT] += -mag * e0to1[0];
            s[e0loc + PART_Y_FTOT] += -mag * e0to1[1];
            s[e0loc + PART_Z_FTOT] += -mag * e0to1[2];
            // Apply force to e1:  equal-but-opposite to e0 damping force;
            s[e1loc + PART_X_FTOT] +=  mag * e0to1[0];
            s[e1loc + PART_Y_FTOT] +=  mag * e0to1[1];
            s[e1loc + PART_Z_FTOT] +=  mag * e0to1[2];

            // more dampening
            s[e0loc + PART_X_FTOT] -= s[e0loc + PART_XVEL] * 0.4;
            s[e0loc + PART_Y_FTOT] -= s[e0loc + PART_YVEL] * 0.4;
            s[e0loc + PART_Z_FTOT] -= s[e0loc + PART_ZVEL] * 0.4;
            // Apply force to e1:  equal-but-opposite to e0 damping force;
            s[e1loc + PART_X_FTOT] -= s[e1loc + PART_XVEL] * 0.4;
            s[e1loc + PART_Y_FTOT] -= s[e1loc + PART_YVEL] * 0.4;
            s[e1loc + PART_Z_FTOT] -= s[e1loc + PART_ZVEL] * 0.4;
          
        break;
      case F_SPRINGSET:
        console.log("PartSys.applyForces(), fList[",k,"].forceType:", 
                                  fList[k].forceType, "NOT YET IMPLEMENTED!!");
        break;
      case F_CHARGE:
        console.log("PartSys.applyForces(), fList[",k,"].forceType:", 
                                  fList[k].forceType, "NOT YET IMPLEMENTED!!");
        break;
      default:
        console.log("!!!ApplyForces() fList[",k,"] invalid forceType:", fList[k].forceType);
        break;
    } // switch(fList[k].forceType)
  } // for(k=0...)
}

PartSys.prototype.dotFinder = function(dest, src) {
//==============================================================================
// fill the already-existing 'dest' variable (a float32array) with the 
// time-derivative of given state 'src'.  

  var invMass;  // inverse mass
  var j = this.gndVerts * PART_MAXVAR;  // i==particle number; j==array index for i-th particle
  for(var i = this.gndVerts; i < this.partCount; i += 1, j+= PART_MAXVAR) {
    dest[j + PART_XPOS] = src[j + PART_XVEL];   // position derivative = velocity
    dest[j + PART_YPOS] = src[j + PART_YVEL];
    dest[j + PART_ZPOS] = src[j + PART_ZVEL];
    dest[j + PART_WPOS] = 0.0;                  // presume 'w' fixed at 1.0
    // Use 'src' current force-accumulator's values (set by PartSys.applyForces())
    // to find acceleration.  As multiply is FAR faster than divide, do this:
    invMass = 1.0 / src[j + PART_MASS];   // F=ma, so a = F/m, or a = F(1/m);
    dest[j + PART_XVEL] = src[j + PART_X_FTOT] * invMass; 
    dest[j + PART_YVEL] = src[j + PART_Y_FTOT] * invMass;
    dest[j + PART_ZVEL] = src[j + PART_Z_FTOT] * invMass;
    dest[j + PART_X_FTOT] = 0.0;  // we don't know how force changes with time;
    dest[j + PART_Y_FTOT] = 0.0;  // presume it stays constant during timestep.
    dest[j + PART_Z_FTOT] = 0.0;
    dest[j + PART_R] = 0.0;       // presume color doesn't change with time.
    dest[j + PART_G] = 0.0;
    dest[j + PART_B] = 0.0;
    dest[j + PART_MASS] = 0.0;    // presume mass doesn't change with time.
    dest[j + PART_DIAM] = 0.0;    // presume these don't change either...   
    dest[j + PART_RENDMODE] = 0.0;
    dest[j + PART_AGE] = 0.0;
    }
}

PartSys.prototype.render = function(s) {
//==============================================================================
// Draw the contents of state-vector 's' on-screen. To do this:
//  a) transfer its contents to the already-existing VBO in the GPU using the
//      WebGL call 'gl.bufferSubData()', then 
//  b) set all the 'uniform' values needed by our shaders,
//  c) draw VBO contents using gl.drawArray().

  // CHANGE our VBO's contents:
  gl.bufferSubData( 
          gl.ARRAY_BUFFER,  // specify the 'binding target': either
                  //    gl.ARRAY_BUFFER (VBO holding sets of vertex attribs)
                  // or gl.ELEMENT_ARRAY_BUFFER (VBO holding vertex-index values)
          0,      // offset: # of bytes to skip at the start of the VBO before 
                    // we begin data replacement.
          this.s1); // Float32Array data source.

	gl.uniform1i(this.u_runModeID, this.runMode);	// run/step/pause the particle system 

  // render ground plane
  this.renderGnd();
  this.renderCloth();
  this.renderFire();
  this.renderWind();
  this.renderBoids();
                
}

PartSys.prototype.renderBoids = function() {


  pushMatrix(mvpMat);
    //mvpMat.translate(-2, 0, 0);
    gl.uniformMatrix4fv(u_mvpMat_loc, false, mvpMat.elements);

      gl.drawArrays(gl.POINTS,          // mode: WebGL drawing primitive to use 
                    this.gndVerts + this.clothVerts + this.fireVerts + this.windVerts,                  
                    this.boidVerts);    // draw this many vertices.g
  mvpMat = popMatrix();
}

PartSys.prototype.renderWind = function() {

  pushMatrix(mvpMat);
    mvpMat.translate(2, 0, 0);
    j = (this.gndVerts + this.clothVerts + this.fireVerts) * PART_MAXVAR;
    for(var i = 0; i < this.windVerts; i += 1, j+= PART_MAXVAR) {

      zpos = this.s1[j + PART_ZPOS];

      this.s2[j + PART_ZVEL] = 0.4 - zpos * 0.1;
      this.s2[j + PART_DIAM] = 1.0
      if (zpos > 0.7) {
        this.s2[j + PART_DIAM] -= zpos * 0.2;
      }
    }

    gl.uniformMatrix4fv(u_mvpMat_loc, false, mvpMat.elements);

    gl.drawArrays(gl.POINTS,          // mode: WebGL drawing primitive to use 
                  this.gndVerts + this.clothVerts + this.fireVerts,                  
                  this.windVerts);    // draw this many vertices.g

  mvpMat = popMatrix();
}

PartSys.prototype.renderFire = function() {

  // set color

  j = (this.gndVerts + this.clothVerts) * PART_MAXVAR;
  for(var i = 0; i < this.fireVerts; i += 1, j+= PART_MAXVAR) {
    xpos = this.s1[j + PART_XPOS];
    ypos = this.s1[j + PART_YPOS];
    zpos = this.s1[j + PART_ZPOS];

    dist = Math.sqrt(xpos*xpos + ypos*ypos + zpos*zpos);

    this.s2[j + PART_R] = 1.0 - dist * 0.4;
    this.s2[j + PART_G] = 1.0 - dist * 0.9;
    this.s2[j + PART_B] = 0.7 - dist * 0.6;
    this.s2[j + PART_DIAM] = 1.0 - dist * 0.3;
  }

  pushMatrix(mvpMat);
    mvpMat.translate(-2, 0, 0);
    mvpMat.scale(0.5, 0.5, 0.5);
    gl.uniformMatrix4fv(u_mvpMat_loc, false, mvpMat.elements);
    gl.drawArrays(gl.POINTS,          // mode: WebGL drawing primitive to use 
                  this.gndVerts + this.clothVerts,                  // index: start at this vertex in the VBO;
                  this.fireVerts);    // draw this many vertices.g
  mvpMat = popMatrix();
}

PartSys.prototype.renderCloth = function() {

  gl.uniformMatrix4fv(u_mvpMat_loc, false, mvpMat.elements);

  gl.drawArrays(gl.POINTS,          // mode: WebGL drawing primitive to use 
                this.gndVerts,                  // index: start at this vertex in the VBO;
                this.clothVerts);    // draw this many vertices.g
  gl.drawArrays(gl.LINE_STRIP,          // mode: WebGL drawing primitive to use 
                this.gndVerts,                  // index: start at this vertex in the VBO;
                this.clothVerts);    // draw this many vertices.g

}

PartSys.prototype.renderGnd = function() {
  //------------GROUND PLANE-------------------------
  pushMatrix(mvpMat);
    mvpMat.scale(5, 5, 5);
    // x-axis parallel
    for (let i = -1; i < 1; i += .05) {
      pushMatrix(mvpMat);
        mvpMat.translate(0, i, 0);
        gl.uniformMatrix4fv(u_mvpMat_loc, false, mvpMat.elements);
        gl.drawArrays(gl.LINE_LOOP,  0, 2);
      mvpMat = popMatrix();
    }
    // y axis parallel
    mvpMat.rotate(90, 0, 0, 1);
    for (let i = -1; i < 1; i += .05) {
      pushMatrix(mvpMat);
        mvpMat.translate(0, i, 0);
        gl.uniformMatrix4fv(u_mvpMat_loc, false, mvpMat.elements);
        gl.drawArrays(gl.LINE_LOOP,  0, 2);
      mvpMat = popMatrix();
    }
  mvpMat = popMatrix();
}

PartSys.prototype.solver = function() {
//==============================================================================
// Find next state s2 from current state s1 (and perhaps some related states
// such as s1dot, sM, sMdot, etc.) by the numerical integration method chosen
// by PartSys.solvType.

		switch(this.solvType)
		{
		  case SOLV_EULER://--------------------------------------------------------
			// EXPLICIT or 'forward time' solver; Euler Method: s2 = s1 + h*s1dot
      for(var n = this.gndVerts; n < this.s1.length; n++) { // for all elements in s1,s2,s1dot;
          this.s2[n] = this.s1[n] + this.s1dot[n] * (g_timeStep * 0.001); 
        }
		  break;
		case SOLV_OLDGOOD://-------------------------------------------------------------------
			// IMPLICIT or 'reverse time' solver, as found in bouncyBall04.goodMKS;
			// This category of solver is often better, more stable, but lossy.
			// -- apply acceleration due to gravity to current velocity:
			//				  s2[PART_YVEL] -= (accel. due to gravity)*(g_timestep in seconds) 
			//                  -= (9.832 meters/sec^2) * (g_timeStep/1000.0);
      var j = 0;  // i==particle number; j==array index for i-th particle
      for(var i = this.gndVerts; i < this.partCount; i += 1, j+= PART_MAXVAR) {
        
  			this.s2[j + PART_ZVEL] -= this.grav*(g_timeStep*0.001);
  			// -- apply drag: attenuate current velocity:
  			this.s2[j + PART_XVEL] *= this.drag;
  			this.s2[j + PART_YVEL] *= this.drag;
  			this.s2[j + PART_ZVEL] *= this.drag;
  			// -- move our particle using current velocity:
  			// CAREFUL! must convert g_timeStep from milliseconds to seconds!
  			this.s2[j + PART_XPOS] += this.s2[j + PART_XVEL] * (g_timeStep * 0.001);
  			this.s2[j + PART_YPOS] += this.s2[j + PART_YVEL] * (g_timeStep * 0.001); 
  			this.s2[j + PART_ZPOS] += this.s2[j + PART_ZVEL] * (g_timeStep * 0.001); 
        
  		}
			// What's the result of this rearrangement?
			//	IT WORKS BEAUTIFULLY! much more stable much more often...
		  break;
    case SOLV_MIDPOINT:         // Midpoint Method (see lecture notes)
      // determine sM
      for(var n = this.gndVerts; n < this.s1.length; n++) { // for all elements in s1,s2,s1dot;
        this.sM[n] = this.s1[n] + this.s1dot[n] * ((g_timeStep * 0.001) / 2);
      }

      // dot finder
      this.dotFinder(this.sMDot, this.sM);
      
      //final s2
      for(var n = this.gndVerts; n < this.s1.length; n++) { // for all elements in s1,s2,s1dot;
        this.s2[n] = this.s1[n] + this.sMDot[n] * (g_timeStep * 0.001); 
      }
      break;
    case SOLV_ADAMS_BASH:       // Adams-Bashforth Explicit Integrator
      console.log('NOT YET IMPLEMENTED: this.solvType==' + this.solvType);
      break;
    case SOLV_RUNGEKUTTA:       // Arbitrary degree, set by 'solvDegree'
      console.log('NOT YET IMPLEMENTED: this.solvType==' + this.solvType);
      break;
    case SOLV_BACK_EULER:       // 'Backwind' or Implicit Euler

      // initial step
      for(var n = this.gndVerts; n < this.s1.length; n++) { // for all elements in s1,s2,s1dot;
        this.s2[n] = this.s1[n] + this.s1dot[n] * (g_timeStep * 0.001); 
      }

      // dot finder
      this.dotFinder(this.s2dot, this.s2);
  
      for(var n = this.gndVerts; n < this.s1.length; n++) { // for all elements in s1,s2,s1dot;
        // backward step
        this.s3[n] = this.s2[n] - this.s2dot[n] * (g_timeStep * 0.001); 
        // calculate error, using sM as sErr so i don't need to make a new vector
        this.sM[n] = this.s3[n] - this.s1[n]; 
        // actual step, s2 + 0.5 * err
        this.s2[n] = this.s2[n] + 0.5 * this.sM[n]; 

      }
      break;
    case  SOLV_BACK_MIDPT:      // 'Backwind' or Implicit Midpoint
      // initial sM
      for(var n = this.gndVerts; n < this.s1.length; n++) { // for all elements in s1,s2,s1dot;
        this.sM[n] = this.s1[n] + this.s1dot[n] * ((g_timeStep * 0.001) / 2)
      }
      // dot finder sM
      this.dotFinder(this.sMDot, this.sM);
      // initial s2
      for(var n = this.gndVerts; n < this.s1.length; n++) { // for all elements in s1,s2,s1dot;
        this.s2[n] = this.s1[n] + this.sMDot[n] * (g_timeStep * 0.001); 
      }

      // dot finder s2
      this.dotFinder(this.s2dot, this.s2);
      // backward sM
      for(var n = this.gndVerts; n < this.s1.length; n++) { // for all elements in s1,s2,s1dot;
        this.sM[n] = this.s2[n] - this.s2dot[n] * ((g_timeStep * 0.001) / 2);
      }
      // dot finder sM
      this.dotFinder(this.sMDot, this.sM)
      // set s3
      for(var n = this.gndVerts; n < this.s1.length; n++) { // for all elements in s1,s2,s1dot;
        this.s3[n] = this.s2[n] - this.sMDot[n] * (g_timeStep * 0.001);
        // calculate error, using sM as sErr so i don't need to make a new vector
        this.sM[n] = this.s3[n] - this.s1[n];
        // actual step
        this.s2[n] = this.s2[n] - 0.5 * this.sM[n]; 
      }
      

      break;
    case SOLV_BACK_ADBASH:      // 'Backwind' or Implicit Adams-Bashforth
      console.log('NOT YET IMPLEMENTED: this.solvType==' + this.solvType);
      break;
    case SOLV_VERLET:          // Verlet semi-implicit integrator;
      console.log('NOT YET IMPLEMENTED: this.solvType==' + this.solvType);
      break;
    case SOLV_VEL_VERLET:      // 'Velocity-Verlet'semi-implicit integrator

    var h = (g_timeStep * 0.001)
    var j = this.gndVerts * PART_MAXVAR;

    for(var n = this.gndVerts; n < this.partCount; n += 1, j += PART_MAXVAR) { // for all elements in s1,s2,s1dot;

      // set position
      this.s2[j + PART_XPOS] = this.s1[j + PART_XPOS] + this.s1dot[j + PART_XPOS] * h + this.s1dot[j + PART_XVEL] * (h*h / 2); 
      this.s2[j + PART_YPOS] = this.s1[j + PART_YPOS] + this.s1dot[j + PART_YPOS] * h + this.s1dot[j + PART_YVEL] * (h*h / 2);  
      this.s2[j + PART_ZPOS] = this.s1[j + PART_ZPOS] + this.s1dot[j + PART_ZPOS] * h + this.s1dot[j + PART_ZVEL] * (h*h / 2); 

      this.applyForces(this.s2, this.forceList)
      this.dotFinder(this.s2dot, this.s2)

      // set velocity
      this.s2[j + PART_XVEL] = this.s1[j + PART_XVEL] + (this.s2dot[j + PART_XVEL] + this.s1dot[j + PART_XVEL]) * (h / 2);     
      this.s2[j + PART_YVEL] = this.s1[j + PART_YVEL] + (this.s2dot[j + PART_YVEL] + this.s1dot[j + PART_YVEL]) * (h / 2); 
      this.s2[j + PART_ZVEL] = this.s1[j + PART_ZVEL] + (this.s2dot[j + PART_ZVEL] + this.s1dot[j + PART_ZVEL]) * (h / 2);  
    }
      
      break;
    case SOLV_LEAPFROG:        // 'Leapfrog' integrator
      console.log('NOT YET IMPLEMENTED: this.solvType==' + this.solvType);
      break;
    default:
			console.log('?!?! unknown solver: this.solvType==' + this.solvType);
			break;
		}
		return;
}

PartSys.prototype.doConstraints = function() {
//==============================================================================
// apply all Climit constraint-causing objects in the cList array to the 
// particles/movements between current state sNow and future state sNext.

// 'bounce' our ball off floor & walls at +/- 0.9,+/-0.9, +/-0.9
// where this.bounceType selects constraint type:
// ==0 for simple velocity-reversal, as in all previous versions
// ==1 for textbook's collision resolution method, which uses an 'impulse' 
//          to cancel any velocity boost caused by falling below the floor.
//    
  for(var k = 0; k < this.limitList.length; k++) {  // for every CLimit in cList array,
//    console.log("cList[k].limitType:", cList[k].limitType);
    if(this.limitList[k].limitType <=0) {     //.................Invalid limit? SKIP IT!
                        // if limitType is LIM_NONE or if limitType was
      continue;         // negated to (temporarily) disable the CLimit object,
      }                 // skip this k-th object in the cList[] array.
    // ..................................Set up loop for all targeted particles
    // HOW THIS WORKS:
    // Most, but not all CLimit objects apply constraint to many particles, and
    // the CLimit members 'targFirst' and 'targCount' tell us which ones:
    // *IF* targCount == 0, the CLimit applies ONLY to particle numbers e1,e2
    //          (e.g. the e1 particle begins at sNow[fList[k].e1 * PART_MAXVAR])
    // *IF* targCount < 0, apply the CLimit to 'targFirst' and all the rest
    //      of the particles that follow it in the state variables sNow, sNext.
    // *IF* targCount > 0, apply the CForcer to exactly 'targCount' particles,
    //      starting with particle number 'targFirst'
    // Begin by presuming targCount < 0;
    var m = this.limitList[k].targFirst;    // first targed particle # in the state vars
    var mmax = this.partCount;    // total number of particles in the state vars
                                  // (last particle number we access is mmax-1)
    if(this.limitList[k].targCount==0){    // ! Apply CLimit to e1,e2 particles only!
      m=mmax=0;   // don't let loop run; apply CLimit to e1,e2 particles only.
      }
    else if(this.limitList[k].targCount > 0) {   // ?did CLimit say HOW MANY particles?
      // YES! limit applies to 'targCount' particles starting with particle # m:
      var tmp = this.limitList[k].targCount;
      if(tmp < mmax) mmax = tmp; // (but MAKE SURE mmax doesn't get larger)
      else console.log("\n\n!!PartSys.doConstraints() index error!!\n\n");
      }
      //console.log("m:",m,"mmax:",mmax);
      // m and mmax are now correctly initialized; use them!  
    //......................................Apply limit specified by limitType 
    switch(this.limitList[k].limitType) {    // what kind of limit should we apply?
      case LIM_VOL:     // The axis-aligned rectangular volume specified by
                        // cList[k].xMin,xMax,yMin,yMax,zMin,zMax keeps
                        // particles INSIDE if xMin<xMax, yMin<yMax, zMin<zMax
                        //      and OUTSIDE if xMin>xMax, yMin>yMax, zMin>xMax.
        var xMin = this.limitList[k].xMin;
        var xMax = this.limitList[k].xMax;
        var yMin = this.limitList[k].yMin;
        var yMax = this.limitList[k].yMax;
        var zMin = this.limitList[k].zMin;
        var zMax = this.limitList[k].zMax;
        
        var j = m*PART_MAXVAR;  // state var array index for particle # m

        for(var i = 0; i < this.limitList[k].partCount; i += 1, j+= PART_MAXVAR) {

          if(      this.s2[j + PART_XPOS] < xMin && this.s2[j + PART_XVEL] < 0.0 ) {	// collision!  left wall...
          
            this.s2[j + PART_XPOS] = xMin;					// resolve contact: put particle at wall.

            if (this.limitList[k].hitType == HIT_BOUNCE_VEL) {
              if( this.s2[j + PART_XVEL] < 0.0) 
                this.s2[j + PART_XVEL] = -this.limitList[k].Kresti * this.s2[j + PART_XVEL];
              else 
                this.s2[j + PART_XVEL] =  this.limitList[k].Kresti * this.s2[j + PART_XVEL];
            }
            else {
              this.s2[j + PART_XVEL] = 0;
            }          		
          }
          else if (this.s2[j + PART_XPOS] > xMax && this.s2[j + PART_XVEL] > 0.0) {	// collision! right wall...

            this.s2[j + PART_XPOS] = xMax; 					// resolve contact: put particle at wall.
            
            if (this.limitList[k].hitType == HIT_BOUNCE_VEL) {
              if( this.s2[j + PART_XVEL] > 0.0) 
                this.s2[j + PART_XVEL] = -this.limitList[k].Kresti * this.s2[j + PART_XVEL];
              else 
                this.s2[j + PART_XVEL] =  this.limitList[k].Kresti * this.s2[j + PART_XVEL];
            }
            else {
              this.s2[j + PART_XVEL] = 0;
            }
          }
    
          if(      this.s2[j + PART_YPOS] < yMin && this.s2[j + PART_YVEL] < 0.0 ) {	// collision!  south wall...
            
            this.s2[j + PART_YPOS] = yMin;					// resolve contact: put particle at wall.
            
            if (this.limitList[k].hitType == HIT_BOUNCE_VEL) {
              if( this.s2[j + PART_YVEL] < 0.0) 
                this.s2[j + PART_YVEL] = -this.limitList[k].Kresti * this.s2[j + PART_YVEL];
              else 
                this.s2[j + PART_YVEL] =  this.limitList[k].Kresti * this.s2[j + PART_YVEL];
            }
            else {
              this.s2[j + PART_YVEL] = 0;
            }
          }
          else if (this.s2[j + PART_YPOS] > yMax && this.s2[j + PART_YVEL] > 0.0) {	// collision! north wall...

            this.s2[j + PART_YPOS] = yMax; 					// resolve contact: put particle at wall.
            
            if (this.limitList[k].hitType == HIT_BOUNCE_VEL) {
              if( this.s2[j + PART_YVEL] > 0.0) 
                this.s2[j + PART_YVEL] = -this.limitList[k].Kresti * this.s2[j + PART_YVEL];
              else 
                this.s2[j + PART_YVEL] =  this.limitList[k].Kresti * this.s2[j + PART_YVEL];
            }
            else {
              this.s2[j + PART_YVEL] = 0;
            }		
          }
          
          if( this.s2[j + PART_ZPOS] < zMin && this.s2[j + PART_ZVEL] < 0.0) {	// collision! floor...

            this.s2[j + PART_ZPOS] = zMin; // resolve contact: put particle at wall.
            
            if (this.limitList[k].hitType == HIT_BOUNCE_VEL) {
              if( this.s2[j + PART_ZVEL] < 0.0) 
                this.s2[j + PART_ZVEL] = -this.limitList[k].Kresti * this.s2[j + PART_ZVEL];
              else 
                this.s2[j + PART_ZVEL] =  this.limitList[k].Kresti * this.s2[j + PART_ZVEL];
            }
            else {
              this.s2[j + PART_ZVEL] = 0;
            }
          }
          else if( this.s2[j + PART_ZPOS] > zMax && this.s2[j + PART_ZVEL] > 0.0) { 		// collision! ceiling...
    
            this.s2[j + PART_ZPOS] = zMax; // resolve contact: put particle at wall.
            
            if (this.limitList[k].hitType == HIT_BOUNCE_VEL) {
              if( this.s2[j + PART_ZVEL] > 0.0) 
                this.s2[j + PART_ZVEL] = -this.limitList[k].Kresti * this.s2[j + PART_ZVEL];
              else 
                this.s2[j + PART_ZVEL] =  this.limitList[k].Kresti * this.s2[j + PART_ZVEL];
            }
            else {
              this.s2[j + PART_ZVEL] = 0;
            }	
          }
        }
        break;
      case LIM_WALL:    // 2-sided wall: rectangular, axis-aligned, flat/2D,
                        // zero thickness, any desired size & position
        break;
      case LIM_DISC:    // 2-sided ellipsoidal wall, axis-aligned, flat/2D,
                        // zero thickness, any desired size & position
        break;
      case LIM_BOX:
        break;
      case LIM_MAT_WALL:
        break;
      case LIM_MAT_DISC:
        break;         
      default:
        console.log("!!!doConstraints() cList[",k,"] invalid limitType:", cList[k].limitType);
        break;
    } // switch(cList[k].limitType)
  } // for(k=0...)


//-----------------------------'age' constraint fire:
  //if(this.isFountain == 1)    // When particle age falls to zero, re-initialize
                              // to re-launch from a randomized location with
                              // a randomized velocity and randomized age.
                              
  var start = (this.gndVerts + this.clothVerts);  // i==particle number; j==array index for i-th particle
  j = start * PART_MAXVAR;
  for(var i = 0; i < this.fireVerts; i += 1, j+= PART_MAXVAR) {
    this.s2[j + PART_AGE] -= 1;     // decrement lifetime.
    if(this.s2[j + PART_AGE] <= 0) { // End of life: RESET this particle!
      //this.roundRand();       // set this.randX,randY,randZ to random location in 
                              // a 3D unit sphere centered at the origin.
      //all our bouncy-balls stay within a +/- 0.9 cube centered at origin; 
      // set random positions in a 0.1-radius ball centered at (-0.8,-0.8,-0.8)
      this.s2[j + PART_XPOS] =  Math.random() - 0.5; 
      this.s2[j + PART_YPOS] =  Math.random() - 0.5;  
      this.s2[j + PART_ZPOS] =  Math.random() * 0.2;
      this.s2[j + PART_WPOS] =  1.0;    
      this.s2[j + PART_XVEL] =  (Math.random() - 0.5) * 0.1;
      this.s2[j + PART_YVEL] =  (Math.random() - 0.5) * 0.1;
      this.s2[j + PART_ZVEL] =  Math.random() * 0.5;
      this.s2[j + PART_R] = 1.0;
      this.s2[j + PART_G] = 1.0;
      this.s2[j + PART_B] = 0.7;
      this.s2[j + PART_AGE] = 50 + 100*Math.random();
      } // if age <=0
  } // for loop thru all particles

//-----------------------------'age' constraint tornado:
  //if(this.isFountain == 1)    // When particle age falls to zero, re-initialize
                              // to re-launch from a randomized location with
                              // a randomized velocity and randomized age.
                              
  var start = (this.gndVerts + this.clothVerts + this.fireVerts);  // i==particle number; j==array index for i-th particle
  j = start * PART_MAXVAR;
  for(var i = 0; i < this.windVerts; i += 1, j+= PART_MAXVAR) {
    this.s2[j + PART_AGE] -= 1;     // decrement lifetime.
    if(this.s2[j + PART_AGE] <= 0) { // End of life: RESET this particle!
      //this.roundRand();       // set this.randX,randY,randZ to random location in 
                              // a 3D unit sphere centered at the origin.
      //all our bouncy-balls stay within a +/- 0.9 cube centered at origin; 
      // set random positions in a 0.1-radius ball centered at (-0.8,-0.8,-0.8)
      this.s2[j + PART_XPOS] =  (Math.random() - 0.5) * 0.25; 
      this.s2[j + PART_YPOS] =  (Math.random() - 0.5) * 0.25;  
      this.s2[j + PART_ZPOS] =   0 //Math.random();
      this.s2[j + PART_WPOS] =  1.0;   
      this.s2[j + PART_XVEL] =  0;
      this.s2[j + PART_YVEL] =  0;
      this.s2[j + PART_AGE] = 100 + 100*Math.random();
      //this.s1[j + PART_DIAM] = 1.0;
      } // if age <=0
  } // for loop thru all particles
  
}

PartSys.prototype.step = function() {
//==============================================================================
// Choose the method you want:

// We can EXCHANGE, actually step the contents of s1 and s2, like this:  
// but !! YOU PROBABLY DON'T WANT TO DO THIS !!
/*
  var tmp = this.s1;
  this.s1 = this.s2;
  this.s2 = tmp;
*/

// Or we can REPLACE s1 contents with s2 contents, like this:
// NOTE: if we try:  this.s1 = this.s2; we DISCARD s1's memory!!

  this.s1.set(this.s2);     // set values of s1 array to match s2 array.
// (WHY? so that your solver can make intermittent changes to particle
// values without any unwanted 'old' values re-appearing. For example,
// At timestep 36, particle 11 had 'red' color in s1, and your solver changes
// its color to blue in s2, but makes no further changes.  If step() EXCHANGES 
// s1 and s2 contents, on timestep 37 the particle is blue, but on timestep 38
// the particle is red again!  If we REPLACE s1 contents with s2 contents, the
// particle is red at time step 36, but blue for 37, 38, 39 and all further
// timesteps until we change it again.
// REPLACE s1 contents with s2 contents:
}


