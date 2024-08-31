import java.util.Scanner;

class MaxNumberFinder {

    static int findMax(int num1, int num2) {
        if (num1 > num2) {
            return num1;
        } else {
            return num2;
        }
    }

    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);
        
        System.out.print("Enter the first number: ");
        int firstNumber = scanner.nextInt();
        
        System.out.print("Enter the second number: ");
        int secondNumber = scanner.nextInt();
        
        int maxNumber = findMax(firstNumber, secondNumber);
        
        System.out.println("The maximum number is: " + maxNumber);
        
        scanner.close();
    }
}
