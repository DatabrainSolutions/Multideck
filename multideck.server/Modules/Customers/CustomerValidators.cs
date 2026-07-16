using FluentValidation;

namespace Multideck.Server.Modules.Customers;

public sealed class CreateCustomerRequestValidator : AbstractValidator<CreateCustomerRequest>
{
    public CreateCustomerRequestValidator()
    {
        RuleFor(request => request.Name)
            .NotEmpty().WithMessage("Enter the customer name.")
            .MaximumLength(100).WithMessage("Customer names must be 100 characters or fewer.");

        RuleFor(request => request.OrgTypeId)
            .NotEmpty().WithMessage("Choose an organisation type.");

        RuleFor(request => request.AddressLine1).MaximumLength(50).When(request => !string.IsNullOrWhiteSpace(request.AddressLine1));
        RuleFor(request => request.TownCity).MaximumLength(50).When(request => !string.IsNullOrWhiteSpace(request.TownCity));
        RuleFor(request => request.PostZipCode).MaximumLength(50).When(request => !string.IsNullOrWhiteSpace(request.PostZipCode));
        RuleFor(request => request.CountryCode)
            .Length(2).WithMessage("Country must be a 2-letter ISO code.")
            .When(request => !string.IsNullOrWhiteSpace(request.CountryCode));
        RuleFor(request => request.ContactFirstName).MaximumLength(50).When(request => !string.IsNullOrWhiteSpace(request.ContactFirstName));
        RuleFor(request => request.ContactLastName).MaximumLength(50).When(request => !string.IsNullOrWhiteSpace(request.ContactLastName));
        RuleFor(request => request.ContactEmail).EmailAddress().When(request => !string.IsNullOrWhiteSpace(request.ContactEmail));
    }
}
