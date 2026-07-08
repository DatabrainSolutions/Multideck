using FluentValidation;

namespace Multideck.Server.Modules.Warehouse.Facilities;

public sealed class CreateFacilityRequestValidator : AbstractValidator<CreateFacilityRequest>
{
    public CreateFacilityRequestValidator()
    {
        RuleFor(request => request.Code)
            .NotEmpty().WithMessage("Enter a facility code.")
            .MaximumLength(40).WithMessage("Facility codes must be 40 characters or fewer.");

        RuleFor(request => request.Name)
            .NotEmpty().WithMessage("Enter a facility name.")
            .MaximumLength(180).WithMessage("Facility names must be 180 characters or fewer.");

        RuleFor(request => request.TypeCode)
            .NotEmpty().WithMessage("Choose a facility type.")
            .MaximumLength(60);

        RuleFor(request => request.Unlocode)
            .MaximumLength(5).WithMessage("UN/LOCODE must be 5 characters or fewer.")
            .When(request => !string.IsNullOrWhiteSpace(request.Unlocode));

        RuleFor(request => request.CountryCode)
            .Length(2).WithMessage("Country code must be a 2-letter ISO code.")
            .When(request => !string.IsNullOrWhiteSpace(request.CountryCode));

        RuleFor(request => request.Address1).MaximumLength(180);
        RuleFor(request => request.Address2).MaximumLength(180);
        RuleFor(request => request.TownCity).MaximumLength(120);
        RuleFor(request => request.CountyState).MaximumLength(120);
        RuleFor(request => request.PostZipCode).MaximumLength(40);
        RuleFor(request => request.TimeZone).MaximumLength(80);
        RuleFor(request => request.DefaultCustomsStatusCode).MaximumLength(60);
    }
}

public sealed class UpdateFacilityRequestValidator : AbstractValidator<UpdateFacilityRequest>
{
    public UpdateFacilityRequestValidator()
    {
        RuleFor(request => request.Code)
            .NotEmpty().WithMessage("Enter a facility code.")
            .MaximumLength(40).WithMessage("Facility codes must be 40 characters or fewer.");

        RuleFor(request => request.Name)
            .NotEmpty().WithMessage("Enter a facility name.")
            .MaximumLength(180).WithMessage("Facility names must be 180 characters or fewer.");

        RuleFor(request => request.TypeCode)
            .NotEmpty().WithMessage("Choose a facility type.")
            .MaximumLength(60);

        RuleFor(request => request.Unlocode)
            .MaximumLength(5).WithMessage("UN/LOCODE must be 5 characters or fewer.")
            .When(request => !string.IsNullOrWhiteSpace(request.Unlocode));

        RuleFor(request => request.CountryCode)
            .Length(2).WithMessage("Country code must be a 2-letter ISO code.")
            .When(request => !string.IsNullOrWhiteSpace(request.CountryCode));

        RuleFor(request => request.Address1).MaximumLength(180);
        RuleFor(request => request.Address2).MaximumLength(180);
        RuleFor(request => request.TownCity).MaximumLength(120);
        RuleFor(request => request.CountyState).MaximumLength(120);
        RuleFor(request => request.PostZipCode).MaximumLength(40);
        RuleFor(request => request.TimeZone).MaximumLength(80);
        RuleFor(request => request.DefaultCustomsStatusCode).MaximumLength(60);
    }
}
