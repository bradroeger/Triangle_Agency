#include <WiFi.h>
#include <WebServer.h>
#include <Adafruit_NeoPixel.h>

// ============================================================
// WIFI
// ============================================================

const char* ssid = "CHANGE_ME";
const char* password = "CHANGE_ME";

WebServer server(80);


// ============================================================
// LED SETUP
// ============================================================

#define LED_PIN 14
#define NUM_LEDS 17

Adafruit_NeoPixel pixels(
  NUM_LEDS,
  LED_PIN,
  NEO_GRB + NEO_KHZ800
);


// ============================================================
// BUTTON
// ============================================================

#define STATUS_BUTTON_PIN 27

bool lightsOff = false;
bool lastButtonState = HIGH;


// ============================================================
// SYSTEM STATES
// ============================================================

enum SystemState {
  STARTING,
  READY,
  LOGGED_IN,
  CHAOS,
  BOOTING
};

SystemState systemState = STARTING;


// ============================================================
// STARTUP
// ============================================================

unsigned long startupStartTime = 0;
bool startupComplete = false;


// ============================================================
// CHAOS
// ============================================================

unsigned long chaosStartTime = 0;
unsigned long chaosDuration = 46100;
unsigned long bootSequenceStartTime = 0;
const unsigned long BOOT_SEQUENCE_DURATION = 31700;
const unsigned long BOOT_DARK_DURATION = 2500;
const unsigned long BOOT_RAMP_DURATION =
  BOOT_SEQUENCE_DURATION - BOOT_DARK_DURATION;
int bootDriveBrightness = 2;
unsigned long bootDriveNextChange = 0;

// 0 = RED
// 1 = BLUE
// 2 = PURPLE
int chaosState[NUM_LEDS];
bool chaosOn[NUM_LEDS];

unsigned long chaosNextChange[NUM_LEDS];

// ============================================================
// BLACKOUT AFTER CHAOS
// ============================================================

unsigned long blackoutUntil = 0;


// ============================================================
// PROCESSING DISPLAY
// PIXELS 0-5
// ============================================================

struct PixelState {
  int brightness;
  int target;
  int speed;
};

PixelState processing[6];

unsigned long lastProcessingUpdate = 0;


// ============================================================
// LIGHT BAR
// PIXELS 6-9
// ============================================================

float barPosition = 0.0;
int barDirection = 1;

unsigned long lastBarUpdate = 0;


// ============================================================
// HELP ME MORSE
// PIXEL 10
// ============================================================

const char* morseMessage[] = {
  "....",
  ".",
  ".-..",
  ".--.",
  "",
  "--",
  "."
};

const int morseLetters = 7;

int morseLetter = 0;
int morseSymbol = 0;

bool morseOn = false;

unsigned long morseTimer = 0;

const unsigned long DOT_TIME = 300;
const unsigned long DASH_TIME = 900;
const unsigned long SYMBOL_GAP = 300;
const unsigned long LETTER_GAP = 900;
const unsigned long WORD_GAP = 2100;


// ============================================================
// STATUS LIGHTS
// PIXELS 11-13
// ============================================================
// 11 = Blue
// 12 = Blue
// 13 = Red
// ============================================================

unsigned long lastStatusUpdate = 0;


// ============================================================
// CORS
// ============================================================

void sendCORS() {

  server.sendHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  server.sendHeader(
    "Access-Control-Allow-Methods",
    "POST, OPTIONS"
  );

  server.sendHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );
}


// ============================================================
// OPTIONS / CORS PREFLIGHT
// ============================================================

void handleOptions() {

  sendCORS();

  server.send(204);
}


// ============================================================
// LOGIN
// ============================================================

void handleLogin() {

  Serial.println("LOGIN command received!");

  lightsOff = false;
  systemState = LOGGED_IN;

  sendCORS();

  server.send(
    200,
    "text/plain",
    "LOGIN received"
  );
}


// ============================================================
// LOGOUT
// ============================================================

void handleLogout() {

  Serial.println("LOGOUT command received!");

  lightsOff = false;

  if (systemState == LOGGED_IN) {
    systemState = READY;
  }

  sendCORS();

  server.send(
    200,
    "text/plain",
    "LOGOUT received"
  );
}


// ============================================================
// CHAOS
// ============================================================
void handleChaos() {

  Serial.println("CHAOS command received!");

  lightsOff = false;

  if (systemState != CHAOS) {
    systemState = CHAOS;
    chaosStartTime = millis();

    unsigned long now = millis();

    for (int i = 0; i < NUM_LEDS; i++) {

      // HELP ME is never part of chaos.
      if (i == 10) {
        continue;
      }

      // Start each LED with a random colour.
      chaosState[i] = random(0, 3);
      chaosOn[i] = true;

      // Stagger the first flashes so the strip does not pulse in unison.
      chaosNextChange[i] = now + random(40, 140);
    }
  }

  sendCORS();

  server.send(
    200,
    "text/plain",
    "CHAOS received"
  );
}


// ============================================================
// BOOT SEQUENCE
// ============================================================

void handleBootSequence() {

  Serial.println("BOOT SEQUENCE command received!");

  lightsOff = false;
  morseOn = false;
  systemState = BOOTING;
  bootSequenceStartTime = millis();
  bootDriveBrightness = 2;
  bootDriveNextChange = bootSequenceStartTime;
  pixels.clear();

  sendCORS();

  server.send(
    200,
    "text/plain",
    "BOOT SEQUENCE received"
  );
}


// ============================================================
// STARTUP
// ============================================================

void handleStartup() {

  Serial.println(
    "STARTUP command received!"
  );

  lightsOff = false;
  systemState = STARTING;
  pixels.clear();
  for (int i = 6; i <= 9; i++) {
    pixels.setPixelColor(i, pixels.Color(255, 255, 255));
  }

  startupStartTime = millis();

  startupComplete = false;

  // No blackout for a normal startup command.
  blackoutUntil = millis();

  sendCORS();

  server.send(
    200,
    "text/plain",
    "STARTUP received"
  );
}


// ============================================================
// LIGHTS OFF
// ============================================================

void handleLightsOff() {

  Serial.println(
    "LIGHTS OFF command received!"
  );

  lightsOff = true;

  sendCORS();

  server.send(
    200,
    "text/plain",
    "LIGHTS OFF received"
  );
}


// ============================================================
// SETUP
// ============================================================

void setup() {

  Serial.begin(115200);


  // ==========================================================
  // LEDs
  // ==========================================================

  pixels.begin();

  pixels.clear();

  pixels.show();


  // ==========================================================
  // BUTTON
  // ==========================================================

  pinMode(
    STATUS_BUTTON_PIN,
    INPUT_PULLUP
  );


  // ==========================================================
  // RANDOM SEED
  // ==========================================================

  randomSeed(
    analogRead(0)
  );


  // ==========================================================
  // PROCESSING INITIAL STATE
  // ==========================================================

  for (int i = 0; i < 6; i++) {

    processing[i].brightness = 0;
    processing[i].target = 0;
    processing[i].speed = random(3, 12);
  }


  // ==========================================================
  // STARTUP
  // ==========================================================

  startupStartTime = millis();


  // ==========================================================
  // WIFI
  // ==========================================================

  Serial.println();
  Serial.println(
    "Connecting to WiFi..."
  );

  WiFi.begin(
    ssid,
    password
  );

  while (
    WiFi.status() != WL_CONNECTED
  ) {

    delay(500);

    Serial.print(".");
  }

  Serial.println();

  Serial.println(
    "WiFi connected!"
  );

  Serial.print(
    "ESP32 IP address: "
  );

  Serial.println(
    WiFi.localIP()
  );


  // ==========================================================
  // HTTP ROUTES
  // ==========================================================

  server.on(
    "/login",
    HTTP_OPTIONS,
    handleOptions
  );

  server.on(
    "/login",
    HTTP_POST,
    handleLogin
  );


  server.on(
    "/logout",
    HTTP_OPTIONS,
    handleOptions
  );

  server.on(
    "/logout",
    HTTP_POST,
    handleLogout
  );


  server.on(
    "/chaos",
    HTTP_OPTIONS,
    handleOptions
  );

  server.on(
    "/chaos",
    HTTP_POST,
    handleChaos
  );


  server.on(
    "/boot-sequence",
    HTTP_OPTIONS,
    handleOptions
  );

  server.on(
    "/boot-sequence",
    HTTP_POST,
    handleBootSequence
  );


  server.on(
    "/startup",
    HTTP_OPTIONS,
    handleOptions
  );

  server.on(
    "/startup",
    HTTP_POST,
    handleStartup
  );


  server.on(
    "/lights-off",
    HTTP_OPTIONS,
    handleOptions
  );

  server.on(
    "/lights-off",
    HTTP_POST,
    handleLightsOff
  );


  server.begin();

  Serial.println(
    "HTTP server started."
  );
}


// ============================================================
// LOOP
// ============================================================

void loop() {

  unsigned long currentMillis = millis();


  // ==========================================================
  // HTTP
  // ==========================================================

  server.handleClient();
  currentMillis = millis();


  // ==========================================================
  // PHYSICAL BUTTON
  // ==========================================================

  bool buttonState =
    digitalRead(
      STATUS_BUTTON_PIN
    );

  if (
    lastButtonState == HIGH &&
    buttonState == LOW
  ) {

    lightsOff = !lightsOff;

    Serial.print(
      "Lights override: "
    );

    if (lightsOff) {
      Serial.println("OFF");
    }

    else {
      Serial.println("ON");
    }

    delay(50);
  }

  lastButtonState = buttonState;


  // ==========================================================
  // HELP ME MORSE
  // ALWAYS RUNS
  // ==========================================================

  const char* currentMorseLetter = morseMessage[morseLetter];
  int currentMorseLength = strlen(currentMorseLetter);
  unsigned long morseInterval;

  if (morseOn) {
    morseInterval = currentMorseLetter[morseSymbol] == '.'
      ? DOT_TIME
      : DASH_TIME;
  }
  else if (morseSymbol < currentMorseLength) {
    morseInterval = SYMBOL_GAP;
  }
  else {
    int nextLetter = (morseLetter + 1) % morseLetters;
    if (morseMessage[nextLetter][0] == '\0') {
      morseInterval = WORD_GAP;
    }
    else {
      morseInterval = LETTER_GAP;
    }
  }

  if (
    systemState != BOOTING &&
    currentMillis - morseTimer >= morseInterval
  ) {

    morseTimer = currentMillis;

    if (morseOn) {
      morseOn = false;
      morseSymbol++;
    }
    else if (morseSymbol < currentMorseLength) {
      morseOn = true;
    }
    else {
      morseLetter = (morseLetter + 1) % morseLetters;
      if (morseMessage[morseLetter][0] == '\0') {
        morseLetter = (morseLetter + 1) % morseLetters;
      }
      morseSymbol = 0;
      morseOn = true;
    }
  }


  // ==========================================================
  // DIM BOOT SEQUENCE AFTER CHAOS
  // ==========================================================

  if (systemState == BOOTING) {
    unsigned long elapsed = currentMillis - bootSequenceStartTime;
    pixels.clear();

    if (elapsed >= BOOT_DARK_DURATION) {
      float progress =
        (float)(elapsed - BOOT_DARK_DURATION) / BOOT_RAMP_DURATION;

      if (progress > 1.0) {
        progress = 1.0;
      }

      int barBrightness = 2 + (int)(progress * 253.0);
      for (int i = 6; i <= 9; i++) {
        pixels.setPixelColor(
          i,
          pixels.Color(barBrightness, barBrightness, barBrightness)
        );
      }

      if (currentMillis >= bootDriveNextChange) {
        int maximumDriveBrightness = 3 + (int)(progress * 25.0);
        bootDriveBrightness = random(2, maximumDriveBrightness + 1);
        bootDriveNextChange = currentMillis + random(35, 150);
      }
      pixels.setPixelColor(0, pixels.Color(bootDriveBrightness, 0, 0));

      if (progress >= 0.12) {
        pixels.setPixelColor(14, pixels.Color(16, 0, 0));
      }

      if (progress >= 0.48 && progress < 0.92 && (elapsed % 1000) < 130) {
        pixels.setPixelColor(15, pixels.Color(18, 6, 0));
      }
      else if (progress >= 0.92) {
        pixels.setPixelColor(15, pixels.Color(18, 6, 0));
      }
    }
  }


  // ==========================================================
  // STARTUP
  // ==========================================================

  if (
    systemState == STARTING
  ) {

    // --------------------------------------------------------
    // BLACKOUT AFTER CHAOS
    // --------------------------------------------------------

    if (
      currentMillis <
      blackoutUntil
    ) {

      for (
        int i = 0;
        i < NUM_LEDS;
        i++
      ) {

        if (i != 10) {

          pixels.setPixelColor(
            i,
            0
          );
        }
      }
    }


    // --------------------------------------------------------
    // NORMAL STARTUP SEQUENCE
    // --------------------------------------------------------

    else {

      unsigned long elapsed =
        currentMillis -
        startupStartTime;


      // ------------------------------------------------------
      // Red
      // ------------------------------------------------------

      if (elapsed >= 500) {

        pixels.setPixelColor(
          14,
          pixels.Color(
            255,
            0,
            0
          )
        );
      }


      // ------------------------------------------------------
      // Amber
      // ------------------------------------------------------

      if (elapsed >= 1500) {

        pixels.setPixelColor(
          15,
          pixels.Color(
            255,
            100,
            0
          )
        );
      }


      // ------------------------------------------------------
      // Green
      // ------------------------------------------------------

      if (elapsed >= 2500) {

        pixels.setPixelColor(
          16,
          pixels.Color(
            0,
            255,
            0
          )
        );
      }


      // ------------------------------------------------------
      // Startup complete
      // ------------------------------------------------------

      if (elapsed >= 3500) {

        startupComplete = true;

        systemState = READY;

        Serial.println(
          "Startup complete - system READY."
        );
      }
    }
  }


  // ==========================================================
  // NORMAL PROCESSING ACTIVITY
  // ==========================================================

  if (
    systemState == READY ||
    systemState == LOGGED_IN
  ) {

    if (
      currentMillis -
      lastProcessingUpdate >= 20
    ) {

      lastProcessingUpdate =
        currentMillis;


      int activityChance;


      if (
        systemState == READY
      ) {

        activityChance = 3;
      }

      else {

        activityChance = 7;
      }


      // ------------------------------------------------------
      // Random processing activity
      // ------------------------------------------------------

      if (
        random(0, 100) <
        activityChance
      ) {

        int p =
          random(0, 6);

        processing[p].target =
          random(40, 256);

        processing[p].speed =
          random(3, 12);
      }


      // ------------------------------------------------------
      // HDD-style flashes
      // ------------------------------------------------------

      if (
        random(
          0,
          100
        ) <
        (
          systemState == LOGGED_IN
          ? 8
          : 4
        )
      ) {

        processing[0].target = 255;

        processing[0].speed = 30;
      }


      // ------------------------------------------------------
      // Fade processing LEDs
      // ------------------------------------------------------

      for (
        int i = 0;
        i < 6;
        i++
      ) {

        if (
          processing[i].brightness <
          processing[i].target
        ) {

          processing[i].brightness +=
            processing[i].speed;

          if (
            processing[i].brightness >
            processing[i].target
          ) {

            processing[i].brightness =
              processing[i].target;
          }
        }


        else if (
          processing[i].brightness >
          processing[i].target
        ) {

          processing[i].brightness -=
            processing[i].speed;

          if (
            processing[i].brightness <
            processing[i].target
          ) {

            processing[i].brightness =
              processing[i].target;
          }
        }


        // ----------------------------------------------------
        // Randomly allow LEDs to fade down.
        // ----------------------------------------------------

        if (
          processing[i].brightness > 0 &&
          random(0, 100) < 4
        ) {

          processing[i].target = 0;
        }


        int b =
          processing[i].brightness;


        // ----------------------------------------------------
        // Pixel 0 = Red
        // ----------------------------------------------------

        if (i == 0) {

          pixels.setPixelColor(
            i,
            pixels.Color(
              b,
              0,
              0
            )
          );
        }


        // ----------------------------------------------------
        // Pixels 1-3 = Amber
        // ----------------------------------------------------

        else if (i <= 3) {

          pixels.setPixelColor(
            i,
            pixels.Color(
              b,
              b / 3,
              0
            )
          );
        }


        // ----------------------------------------------------
        // Pixels 4-5 = Green
        // ----------------------------------------------------

        else {

          pixels.setPixelColor(
            i,
            pixels.Color(
              0,
              b,
              0
            )
          );
        }
      }
    }
  }


  // ==========================================================
  // LIGHT BAR
  // NORMAL OPERATION
  // ==========================================================

  if (
    systemState == READY ||
    systemState == LOGGED_IN
  ) {

    if (
      currentMillis -
      lastBarUpdate >= 20
    ) {

      lastBarUpdate =
        currentMillis;


      barPosition +=
        0.08 *
        barDirection;


      if (
        barPosition >= 3.0
      ) {

        barPosition = 3.0;

        barDirection = -1;
      }


      if (
        barPosition <= 0.0
      ) {

        barPosition = 0.0;

        barDirection = 1;
      }


      for (
        int i = 0;
        i < 4;
        i++
      ) {

        float distance =
          abs(
            barPosition - i
          );


        float brightness =
          1.0 - distance;


        if (
          brightness < 0
        ) {

          brightness = 0;
        }


        brightness *= 255;


        pixels.setPixelColor(
          6 + i,
          pixels.Color(
            brightness,
            brightness,
            brightness
          )
        );
      }
    }
  }


  // ==========================================================
  // STATUS LIGHTS
  // ==========================================================

  if (
    systemState == READY
  ) {

    pixels.setPixelColor(
      11,
      0
    );

    pixels.setPixelColor(
      12,
      0
    );

    pixels.setPixelColor(
      13,
      0
    );
  }


  else if (
    systemState == LOGGED_IN
  ) {

    pixels.setPixelColor(
      11,
      pixels.Color(
        0,
        0,
        255
      )
    );

    pixels.setPixelColor(
      12,
      pixels.Color(
        0,
        0,
        255
      )
    );

    pixels.setPixelColor(
      13,
      0
    );
  }

// ==========================================================
// CHAOS
// ==========================================================

else if (systemState == CHAOS) {

  unsigned long now = millis();

  for (int i = 0; i < NUM_LEDS; i++) {

    // HELP ME remains completely independent.
    if (i == 10) {
      continue;
    }

    // ------------------------------------------------------
    // Toggle this LED independently for a rapid, irregular strobe.
    // ------------------------------------------------------

    if (now >= chaosNextChange[i]) {

      chaosOn[i] = !chaosOn[i];

      if (chaosOn[i]) {
        chaosState[i] = random(0, 3);
        chaosNextChange[i] = now + random(45, 130);
      }
      else {
        chaosNextChange[i] = now + random(30, 95);
      }
    }


    // ------------------------------------------------------
    // Apply the LED's current colour.
    // ------------------------------------------------------

    if (!chaosOn[i]) {
      pixels.setPixelColor(i, 0);
    }

    else if (chaosState[i] == 0) {

      // RED
      pixels.setPixelColor(
        i,
        pixels.Color(
          255,
          0,
          0
        )
      );
    }

    else if (chaosState[i] == 1) {

      // BLUE
      pixels.setPixelColor(
        i,
        pixels.Color(
          0,
          0,
          255
        )
      );
    }

    else {

      // PURPLE
      pixels.setPixelColor(
        i,
        pixels.Color(
          180,
          0,
          255
        )
      );
    }
  }
}

  // ==========================================================
  // END CHAOS
  // ==========================================================

  if (
    systemState == CHAOS &&
    currentMillis -
    chaosStartTime >=
    chaosDuration
  ) {

    Serial.println(
      "Chaos finished - blackout."
    );


    // --------------------------------------------------------
    // Immediately turn everything off except HELP ME.
    // --------------------------------------------------------

    for (
      int i = 0;
      i < NUM_LEDS;
      i++
    ) {

      if (i != 10) {

        pixels.setPixelColor(
          i,
          0
        );
      }
    }


    // --------------------------------------------------------
    // One second of darkness.
    // --------------------------------------------------------

    blackoutUntil =
      currentMillis + 1000;


    // --------------------------------------------------------
    // Enter startup state.
    // --------------------------------------------------------

    systemState =
      STARTING;


    // Startup begins AFTER blackout.
    startupStartTime =
      blackoutUntil;


    startupComplete =
      false;
  }


  // ==========================================================
  // LIGHTS OFF OVERRIDE
  // ==========================================================
  // Everything except HELP ME goes dark.
  // ==========================================================

  if (lightsOff) {

    for (
      int i = 0;
      i < NUM_LEDS;
      i++
    ) {

      if (i != 10) {

        pixels.setPixelColor(
          i,
          0
        );
      }
    }
  }


  // ==========================================================
  // HELP ME
  // ==========================================================
  // Applied LAST so nothing else can interfere with it.
  // ==========================================================

  if (morseOn) {

    pixels.setPixelColor(
      10,
      pixels.Color(
        255,
        0,
        0
      )
    );
  }

  else {

    pixels.setPixelColor(
      10,
      0
    );
  }


  // ==========================================================
  // SHOW
  // ==========================================================

  pixels.show();
}