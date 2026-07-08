using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class UkcCustomsAuthorisation
{
    public Guid UkcaId { get; set; }

    public Guid? UkcaOrgOfficeId { get; set; }

    public Guid? UkcaOrgId { get; set; }

    public string UkcaAuthorisationType { get; set; } = null!;

    public string UkcaAuthorisationReference { get; set; } = null!;

    public string? UkcaEorinumberSnapshot { get; set; }

    public string? UkcaCountryCodeSnapshot { get; set; }

    public DateOnly? UkcaValidFrom { get; set; }

    public DateOnly? UkcaValidTo { get; set; }

    public bool UkcaIsDefault { get; set; }

    public bool UkcaIsActive { get; set; }

    public string? UkcaNotes { get; set; }

    public DateTime UkcaCreatedAt { get; set; }

    public Guid? UkcaCreatedBy { get; set; }

    public DateTime UkcaUpdatedAt { get; set; }

    public Guid? UkcaUpdatedBy { get; set; }
}
