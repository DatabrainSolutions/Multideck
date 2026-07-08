using FluentValidation;

namespace Multideck.Server.Modules.Warehouse.Items;

/// <summary>Common item attribute surface so create and update share one set of rules.</summary>
public interface IItemAttributes
{
    string? HsCode { get; }
    string? CountryOfOriginCode { get; }
    string? BaseUomCode { get; }
    decimal? LengthM { get; }
    decimal? WidthM { get; }
    decimal? HeightM { get; }
    decimal? NetWeightKg { get; }
    decimal? GrossWeightKg { get; }
    decimal? TemperatureMinC { get; }
    decimal? TemperatureMaxC { get; }
}

public sealed class CreateItemRequestValidator : AbstractValidator<CreateItemRequest>
{
    public CreateItemRequestValidator()
    {
        RuleFor(request => request.CustomerOrgId)
            .NotEmpty().WithMessage("Choose the customer that owns this item.");

        RuleFor(request => request.FacilityId)
            .NotEmpty().WithMessage("Choose the facility where this item is stored.");

        RuleFor(request => request.Sku)
            .NotEmpty().WithMessage("Enter a SKU.")
            .MaximumLength(120).WithMessage("SKUs must be 120 characters or fewer.");

        RuleFor(request => request.Description)
            .NotEmpty().WithMessage("Enter an item description.")
            .MaximumLength(300).WithMessage("Descriptions must be 300 characters or fewer.");

        this.AddItemAttributeRules();
    }
}

public sealed class UpdateItemRequestValidator : AbstractValidator<UpdateItemRequest>
{
    public UpdateItemRequestValidator()
    {
        RuleFor(request => request.FacilityId)
            .NotEmpty().WithMessage("Choose the facility where this item is stored.");

        RuleFor(request => request.Sku)
            .NotEmpty().WithMessage("Enter a SKU.")
            .MaximumLength(120).WithMessage("SKUs must be 120 characters or fewer.");

        RuleFor(request => request.Description)
            .NotEmpty().WithMessage("Enter an item description.")
            .MaximumLength(300).WithMessage("Descriptions must be 300 characters or fewer.");

        this.AddItemAttributeRules();
    }
}

internal static class ItemAttributeRules
{
    public static void AddItemAttributeRules<T>(this AbstractValidator<T> validator)
        where T : IItemAttributes
    {
        validator.RuleFor(request => request.HsCode)
            .MaximumLength(20).When(request => !string.IsNullOrWhiteSpace(request.HsCode));

        validator.RuleFor(request => request.CountryOfOriginCode)
            .Length(2).WithMessage("Country of origin must be a 2-letter ISO code.")
            .When(request => !string.IsNullOrWhiteSpace(request.CountryOfOriginCode));

        validator.RuleFor(request => request.BaseUomCode)
            .MaximumLength(20).When(request => !string.IsNullOrWhiteSpace(request.BaseUomCode));

        validator.RuleFor(request => request.LengthM).GreaterThanOrEqualTo(0).When(request => request.LengthM.HasValue);
        validator.RuleFor(request => request.WidthM).GreaterThanOrEqualTo(0).When(request => request.WidthM.HasValue);
        validator.RuleFor(request => request.HeightM).GreaterThanOrEqualTo(0).When(request => request.HeightM.HasValue);
        validator.RuleFor(request => request.NetWeightKg).GreaterThanOrEqualTo(0).When(request => request.NetWeightKg.HasValue);
        validator.RuleFor(request => request.GrossWeightKg).GreaterThanOrEqualTo(0).When(request => request.GrossWeightKg.HasValue);

        validator.RuleFor(request => request.GrossWeightKg)
            .Must((request, grossWeight) => grossWeight >= request.NetWeightKg)
            .WithMessage("Gross weight cannot be less than net weight.")
            .When(request => request.NetWeightKg.HasValue && request.GrossWeightKg.HasValue);

        validator.RuleFor(request => request.TemperatureMaxC)
            .Must((request, maxTemp) => maxTemp >= request.TemperatureMinC)
            .WithMessage("Maximum temperature cannot be below the minimum temperature.")
            .When(request => request.TemperatureMinC.HasValue && request.TemperatureMaxC.HasValue);
    }
}
