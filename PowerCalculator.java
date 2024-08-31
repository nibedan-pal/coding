import java.util.Scanner;

class PowerCalculator {

    static double calculatePower(double x, int n) {
        double result = 1;
        for (int i = 0; i < Math.abs(n); i++) {
            result *= x;
        }
        if (n < 0) {
            return 1 / result;
        } else {
            return result;
        }
    }

    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);

        System.out.print("Enter the base number (x): ");
        double base = scanner.nextDouble();

        System.out.print("Enter the exponent (n): ");
        int exponent = scanner.nextInt();

        double powerResult = calculatePower(base, exponent);

        System.out.println(base + " raised to the power of " + exponent + " is: " + powerResult);

        scanner.close();
    }
}
