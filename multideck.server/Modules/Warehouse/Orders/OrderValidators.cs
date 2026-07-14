using FluentValidation;

namespace Multideck.Server.Modules.Warehouse.Orders;

public sealed class CreateWarehouseOrderRequestValidator : AbstractValidator<CreateWarehouseOrderRequest>
{
    public CreateWarehouseOrderRequestValidator()
    {
        RuleFor(request => request.FacilityId).NotEmpty().WithMessage("Choose a warehouse.");
        RuleFor(request => request.CustomerOrgId).NotEmpty().WithMessage("Choose a customer.");
        RuleFor(request => request.TypeCode).NotEmpty().WithMessage("Choose inbound or outbound.");
        RuleFor(request => request.PriorityCode).MaximumLength(40);
        RuleFor(request => request.CustomerReference).MaximumLength(160);
        RuleFor(request => request.VehicleReg).MaximumLength(60);
        RuleFor(request => request.ContainerNumber).MaximumLength(20);
        RuleFor(request => request.SealNumber).MaximumLength(80);
        RuleFor(request => request.AppointmentEndAt)
            .GreaterThan(request => request.AppointmentStartAt)
            .When(request => request.AppointmentStartAt.HasValue && request.AppointmentEndAt.HasValue)
            .WithMessage("The appointment end must be after its start.");
        RuleFor(request => request.Lines).NotEmpty().WithMessage("Add at least one item line.");
        RuleForEach(request => request.Lines).SetValidator(new CreateWarehouseOrderLineRequestValidator());
    }
}

public sealed class CreateWarehouseOrderLineRequestValidator : AbstractValidator<CreateWarehouseOrderLineRequest>
{
    public CreateWarehouseOrderLineRequestValidator()
    {
        RuleFor(request => request.ItemId).NotEmpty().WithMessage("Choose an item.");
        RuleFor(request => request.Quantity).GreaterThan(0).WithMessage("Quantity must be greater than zero.");
        RuleFor(request => request.UomCode).MaximumLength(20);
        RuleFor(request => request.LotNumber).MaximumLength(120);
        RuleFor(request => request.CurrencyCode).Length(3).When(request => !string.IsNullOrWhiteSpace(request.CurrencyCode));
        RuleFor(request => request.GoodsValue).GreaterThanOrEqualTo(0).When(request => request.GoodsValue.HasValue);
    }
}

public sealed class ReceiveWarehouseOrderRequestValidator : AbstractValidator<ReceiveWarehouseOrderRequest>
{
    public ReceiveWarehouseOrderRequestValidator()
    {
        RuleFor(request => request.Lines).NotEmpty().WithMessage("Add at least one received line.");
        RuleForEach(request => request.Lines).SetValidator(new ReceiveWarehouseOrderLineRequestValidator());
    }
}

public sealed class ReceiveWarehouseOrderLineRequestValidator : AbstractValidator<ReceiveWarehouseOrderLineRequest>
{
    public ReceiveWarehouseOrderLineRequestValidator()
    {
        RuleFor(request => request.OrderLineId).NotEmpty();
        RuleFor(request => request.Quantity).GreaterThan(0).WithMessage("Received quantity must be greater than zero.");
        RuleFor(request => request.DamagedQuantity).GreaterThanOrEqualTo(0);
        RuleFor(request => request.DamagedQuantity).LessThanOrEqualTo(request => request.Quantity).WithMessage("Damaged quantity cannot exceed received quantity.");
        RuleFor(request => request.LotNumber).MaximumLength(120);
        RuleFor(request => request.BatchNumber).MaximumLength(120);
        RuleFor(request => request.ExpiryDate)
            .GreaterThanOrEqualTo(request => request.ManufactureDate)
            .When(request => request.ManufactureDate.HasValue && request.ExpiryDate.HasValue)
            .WithMessage("Expiry date cannot be before manufacture date.");
    }
}

public sealed class DispatchWarehouseOrderRequestValidator : AbstractValidator<DispatchWarehouseOrderRequest>
{
    public DispatchWarehouseOrderRequestValidator()
    {
        RuleFor(request => request.VehicleReg).MaximumLength(60);
        RuleFor(request => request.ContainerNumber).MaximumLength(20);
        RuleFor(request => request.SealNumber).MaximumLength(80);
        RuleFor(request => request.Lines).NotEmpty().WithMessage("Add at least one dispatch line.");
        RuleForEach(request => request.Lines).SetValidator(new DispatchWarehouseOrderLineRequestValidator());
    }
}

public sealed class DispatchWarehouseOrderLineRequestValidator : AbstractValidator<DispatchWarehouseOrderLineRequest>
{
    public DispatchWarehouseOrderLineRequestValidator()
    {
        RuleFor(request => request.OrderLineId).NotEmpty();
        RuleFor(request => request.Quantity).GreaterThan(0).WithMessage("Dispatch quantity must be greater than zero.");
    }
}

