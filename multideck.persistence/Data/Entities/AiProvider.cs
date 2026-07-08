using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AiProvider
{
    public Guid AipId { get; set; }

    public string AipName { get; set; } = null!;

    public string? AipProviderType { get; set; }

    public string? AipBaseUrl { get; set; }

    public string? AipSecretRef { get; set; }

    public string AipSettingsJson { get; set; } = null!;

    public bool AipIsActive { get; set; }

    public DateTime AipCreatedAt { get; set; }

    public Guid? AipCreatedBy { get; set; }

    public DateTime AipUpdatedAt { get; set; }

    public Guid? AipUpdatedBy { get; set; }

    public virtual ICollection<AiModel> AiModels { get; set; } = new List<AiModel>();
}
