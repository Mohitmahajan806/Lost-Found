#include <Servo.h>


// Ultrasonic pins
#define TRIG_PIN 9
#define ECHO_PIN 10


// Servo pins
#define SERVO1_PIN 5
#define SERVO2_PIN 3


Servo servo1;
Servo servo2;


long duration;
float distance;



void setup()
{

  Serial.begin(9600);


  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);


  servo1.attach(SERVO1_PIN);
  servo2.attach(SERVO2_PIN);


  // Initial position
  servo1.write(0);
  servo2.write(0);


  delay(1000);

}



void loop()
{

  // Send ultrasonic pulse

  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);


  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);


  digitalWrite(TRIG_PIN, LOW);



  // Read echo time

  duration = pulseIn(ECHO_PIN, HIGH);



  // Calculate distance in cm

  distance = duration * 0.034 / 2;



  Serial.print("Distance: ");
  Serial.print(distance);
  Serial.println(" cm");



  // Object detected within 15cm

  if(distance <= 15)
  {

    Serial.println("Object Detected");


    // Move both servos to 90 degrees

    servo1.write(90);
    servo2.write(90);


    delay(1000);



    // Return to zero position

    servo1.write(0);
    servo2.write(0);


    delay(1000);

  }



  delay(200);

}