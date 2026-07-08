using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class UkcTraderIdentifier
{
    public Guid UkctiId { get; set; }

    public Guid UkctiOrgId { get; set; }

    public Guid? UkctiOrgOfficeId { get; set; }

    public string UkctiIdentifierType { get; set; } = null!;

    public string UkctiIdentifierValue { get; set; } = null!;

    public string? UkctiCountryCodeSnapshot { get; set; }

    public bool UkctiIsDefault { get; set; }

    public bool UkctiIsActive { get; set; }

    public DateTime UkctiCreatedAt { get; set; }

    public Guid? UkctiCreatedBy { get; set; }
}
