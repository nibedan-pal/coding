import java.util.*;
class printAverage{
    static int getAverage(int Numer_One, int Number_Two, int Number_Three){
            return (Numer_One + Number_Two + Number_Three) /3;
    }
    public static void main(String args[]){
        Scanner sc = new Scanner(System.in);
        int a= sc.nextInt();
        int b= sc.nextInt();
        int c= sc.nextInt();
        int avg = getAverage(a,b,c);
        System.out.println(avg);
    }
}