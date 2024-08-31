import java.util.Scanner;

class CircleCircumferenceCalculator {

    static double calculateCircumference(double radius) {
        return 2 * Math.PI * radius;
    }

    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);

        System.out.print("Enter the radius of the circle: ");
        double radius = scanner.nextDouble();

        double circumference = calculateCircumference(radius);

        System.out.println("The circumference of the circle is: " + circumference);

        scanner.close();
    }
}
