import { useState, useContext } from "react";
import { Formik, Form, Field, ErrorMessage } from "formik";
import * as Yup from "yup";
import AuthContext from "../../contexts/AuthContext";

const BookingForm = ({ turf, date, timeSlot, onSubmit, onCancel }) => {
  const { authAxios, user } = useContext(AuthContext);
  const [submitError, setSubmitError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Calculate duration and total price
  const calculateDuration = (startTime, endTime) => {
    const [startHour, startMinute] = startTime.split(":").map(Number);
    const [endHour, endMinute] = endTime.split(":").map(Number);

    let hours = endHour - startHour;
    let minutes = endMinute - startMinute;

    if (minutes < 0) {
      hours -= 1;
      minutes += 60;
    }

    return hours + minutes / 60;
  };

  const duration = calculateDuration(timeSlot.startTime, timeSlot.endTime);
  const totalPrice = turf.price * duration;

  // Form validation schema
  const validationSchema = Yup.object({
    numberOfPlayers: Yup.number()
      .required("Number of players is required")
      .min(1, "At least 1 player is required")
      .max(100, "Too many players"),
    specialRequests: Yup.string().max(
      200,
      "Special requests must be less than 200 characters"
    ),
    paymentMethod: Yup.string().required("Payment method is required"),
  });

  // Initial form values
  const initialValues = {
    numberOfPlayers: "",
    specialRequests: "",
    paymentMethod: "cash",
  };

  // Handle form submission
  // const handleSubmit = async (values) => {
  //   if (user?.role === "admin") {
  //     setSubmitError(
  //       "Admin accounts cannot book turfs. Please use a regular user account."
  //     );
  //     return;
  //   }

  //   setIsSubmitting(true);
  //   setSubmitError(null);

  //   try {
  //     const bookingData = {
  //       turf: turf._id,
  //       date: date.toISOString().split("T")[0],
  //       startTime: timeSlot.startTime,
  //       endTime: timeSlot.endTime,
  //       duration,
  //       pricing: {
  //         pricePerHour: turf.price,
  //         currency: "INR",
  //         totalPrice: totalPrice,
  //       },
  //       ...values,
  //     };

  //     // Get token directly from localStorage to ensure it's current
  //     const token = localStorage.getItem("token");

  //     // Include the token in the request headers
  //     const config = {
  //       headers: {
  //         Authorization: `Bearer ${token}`,
  //       },
  //     };

  //     const response = await authAxios.post(
  //       "/api/bookings",
  //       bookingData,
  //       config
  //     );

  //     setIsSubmitting(false);

  //     if (response.data.success) {
  //       onSubmit(response.data.data);
  //     }
  //   } catch (error) {
  //     setIsSubmitting(false);
  //     setSubmitError(
  //       error.response?.data?.message ||
  //         "Failed to create booking. Please try again."
  //     );
  //   }
  // };

  const handleSubmit = async (values) => {
    if (user?.role === "admin") {
      setSubmitError(
        "Admin accounts cannot book turfs. Please use a regular user account."
      );
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const bookingData = {
        turf: turf._id,
        date: date.toISOString().split("T")[0],
        startTime: timeSlot.startTime,
        endTime: timeSlot.endTime,
        duration,
        pricing: {
          pricePerHour: turf.price,
          currency: "INR",
          totalPrice: totalPrice,
        },
        ...values,
      };

      // Get token directly from localStorage to ensure it's current
      const token = localStorage.getItem("token");

      // Include the token in the request headers
      const config = {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      };

      if (values.paymentMethod === "online") {
        // First create the booking in pending state
        const bookingResponse = await authAxios.post(
          "/api/bookings",
          bookingData,
          config
        );
        const booking = bookingResponse.data.data;

        console.log("Using merchant ID for payment:", turf.razorpayMerchantId);

        // Then create Razorpay order
        const orderResponse = await authAxios.post(
          "/api/payments/create-order",
          {
            amount: totalPrice,
            booking: booking._id,
            currency: "INR",
            receipt: `booking_${booking._id}`,
            notes: {
              turfId: turf._id,
              turfMerchantId: turf.razorpayMerchantId,
            },
          },
          config
        );

        const { order } = orderResponse.data;

        // Initialize Razorpay
        const options = {
          key: import.meta.env.VITE_RAZORPAY_KEY_ID,
          amount: order.amount,
          currency: order.currency,
          name: "Turf Booking",
          description: `Booking for ${turf.name}`,
          order_id: order.id,
          handler: async function (response) {
            // Verify payment on the backend
            const verifyData = {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              bookingId: booking._id,
            };

            const verifyResponse = await authAxios.post(
              "/api/payments/verify",
              verifyData,
              config
            );

            if (verifyResponse.data.success) {
              onSubmit(booking);
            }
          },
          prefill: {
            name: user?.name || "",
            email: user?.email || "",
          },
          modal: {
            ondismiss: function () {
              setIsSubmitting(false);
            },
          },
          theme: {
            color: "#16a34a",
          },
        };

        const razorpay = new window.Razorpay(options);
        razorpay.open();
      } else {
        // For cash payments, just create the booking
        const response = await authAxios.post(
          "/api/bookings",
          bookingData,
          config
        );

        setIsSubmitting(false);

        if (response.data.success) {
          onSubmit(response.data.data);
        }
      }
    } catch (error) {
      setIsSubmitting(false);
      setSubmitError(
        error.response?.data?.message ||
          "Failed to create booking. Please try again."
      );
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-md p-4 mb-4">
      <h3 className="text-lg font-semibold mb-4">Complete Your Booking</h3>

      {submitError && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4">
          {submitError}
        </div>
      )}

      {/* Booking Summary */}
      <div className="bg-gray-50 p-4 rounded-md mb-4">
        <h4 className="font-medium text-gray-700 mb-2">Booking Summary</h4>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="text-gray-600">Turf:</div>
          <div className="font-medium">{turf.name}</div>

          <div className="text-gray-600">Date:</div>
          <div className="font-medium">
            {date.toLocaleDateString("en-US", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </div>

          <div className="text-gray-600">Time:</div>
          <div className="font-medium">
            {timeSlot.startTime} - {timeSlot.endTime}
          </div>

          <div className="text-gray-600">Duration:</div>
          <div className="font-medium">{duration} hours</div>

          <div className="text-gray-600">Price/hour:</div>
          <div className="font-medium">₹{turf.price}</div>

          <div className="text-gray-600 font-semibold">Total:</div>
          <div className="font-semibold">₹{totalPrice.toFixed(2)}</div>
        </div>
      </div>

      {/* Booking Form */}
      <Formik
        initialValues={initialValues}
        validationSchema={validationSchema}
        onSubmit={handleSubmit}
      >
        <Form>
          <div className="space-y-4">
            <div>
              <label
                htmlFor="numberOfPlayers"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Number of Players *
              </label>
              <Field
                type="number"
                id="numberOfPlayers"
                name="numberOfPlayers"
                min="1"
                className="w-full p-2 border border-gray-300 rounded-md"
              />
              <ErrorMessage
                name="numberOfPlayers"
                component="div"
                className="text-red-500 text-sm mt-1"
              />
            </div>

            <div>
              <label
                htmlFor="specialRequests"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Special Requests
              </label>
              <Field
                as="textarea"
                id="specialRequests"
                name="specialRequests"
                rows="3"
                className="w-full p-2 border border-gray-300 rounded-md"
                placeholder="Any special requirements or requests..."
              />
              <ErrorMessage
                name="specialRequests"
                component="div"
                className="text-red-500 text-sm mt-1"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Payment Method *
              </label>
              <div className="space-y-2">
                <label className="inline-flex items-center">
                  <Field
                    type="radio"
                    name="paymentMethod"
                    value="cash"
                    className="h-4 w-4 text-green-600 focus:ring-green-500"
                  />
                  <span className="ml-2 text-gray-700">Cash on Arrival</span>
                </label>

                <label className="inline-flex items-center">
                  <Field
                    type="radio"
                    name="paymentMethod"
                    value="online"
                    className="h-4 w-4 text-green-600 focus:ring-green-500"
                  />
                  <span className="ml-2 text-gray-700">Online Payment</span>
                </label>
              </div>
              <ErrorMessage
                name="paymentMethod"
                component="div"
                className="text-red-500 text-sm mt-1"
              />
            </div>

            <div className="flex space-x-3 pt-4">
              <button
                type="submit"
                disabled={isSubmitting}
                className="bg-green-600 w-lg text-white px-6 py-2 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-colors disabled:opacity-50 flex-1"
              >
                {isSubmitting ? "Processing..." : "Confirm Booking"}
              </button>

              <button
                type="button"
                onClick={onCancel}
                className="bg-white text-gray-700 border border-gray-300 px-6 py-2 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </Form>
      </Formik>
    </div>
  );
};

export default BookingForm;
