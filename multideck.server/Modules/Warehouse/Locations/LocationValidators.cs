using FluentValidation;

namespace Multideck.Server.Modules.Warehouse.Locations;

public sealed class CreateLocationRequestValidator : AbstractValidator<CreateLocationRequest>
{
    public CreateLocationRequestValidator()
    {
        RuleFor(request => request.Code)
            .NotEmpty().WithMessage("Enter a location code.")
            .MaximumLength(80).WithMessage("Location codes must be 80 characters or fewer.");

        RuleFor(request => request.TypeCode)
            .NotEmpty().WithMessage("Choose a location type.")
            .MaximumLength(60);

        this.AddLocationAttributeRules();
    }
}

public sealed class UpdateLocationRequestValidator : AbstractValidator<UpdateLocationRequest>
{
    public UpdateLocationRequestValidator()
    {
        RuleFor(request => request.Code)
            .NotEmpty().WithMessage("Enter a location code.")
            .MaximumLength(80).WithMessage("Location codes must be 80 characters or fewer.");

        RuleFor(request => request.TypeCode)
            .NotEmpty().WithMessage("Choose a location type.")
            .MaximumLength(60);

        this.AddLocationAttributeRules();
    }
}

internal static class LocationAttributeRules
{
    public static void AddLocationAttributeRules<T>(this AbstractValidator<T> validator)
        where T : ILocationAttributes
    {
        validator.RuleFor(request => request.Barcode).MaximumLength(160);
        validator.RuleFor(request => request.Aisle).MaximumLength(40);
        validator.RuleFor(request => request.Bay).MaximumLength(40);
        validator.RuleFor(request => request.Level).MaximumLength(40);
        validator.RuleFor(request => request.Position).MaximumLength(40);

        validator.RuleFor(request => request.LengthM).GreaterThanOrEqualTo(0).When(request => request.LengthM.HasValue);
        validator.RuleFor(request => request.WidthM).GreaterThanOrEqualTo(0).When(request => request.WidthM.HasValue);
        validator.RuleFor(request => request.HeightM).GreaterThanOrEqualTo(0).When(request => request.HeightM.HasValue);
        validator.RuleFor(request => request.MaxWeightKg).GreaterThanOrEqualTo(0).When(request => request.MaxWeightKg.HasValue);
        validator.RuleFor(request => request.MaxVolumeCbm).GreaterThanOrEqualTo(0).When(request => request.MaxVolumeCbm.HasValue);

        validator.RuleFor(request => request.TemperatureMaxC)
            .Must((request, maxTemp) => maxTemp >= request.TemperatureMinC)
            .WithMessage("Maximum temperature cannot be below the minimum temperature.")
            .When(request => request.TemperatureMinC.HasValue && request.TemperatureMaxC.HasValue);
    }
}
